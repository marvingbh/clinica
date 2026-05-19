import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"

/**
 * GET /api/appointments/recurrences/slots?professionalProfileId=<id>
 *
 * Returns active AppointmentRecurrence rows (WEEKLY/BIWEEKLY/MONTHLY) that
 * block time on the agenda, for the "Visão de Slots por Recorrência" view.
 * NOTA and LEMBRETE recurrences are excluded — they don't occupy a slot.
 * Filtering by professional honors agenda_others: users without that
 * permission are forced to their own professionalProfileId regardless of
 * the query param.
 */
function addMinutes(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(":").map(Number)
  const total = h * 60 + m + durationMin
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`
}

export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const sp = new URL(req.url).searchParams
    const requestedProfId = sp.get("professionalProfileId")

    const profFilter = canSeeOthers
      ? requestedProfId
      : user.professionalProfileId ?? null

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [rows, groups] = await Promise.all([
      prisma.appointmentRecurrence.findMany({
        where: {
          clinicId: user.clinicId,
          isActive: true,
          recurrenceType: { in: ["WEEKLY", "BIWEEKLY", "MONTHLY"] },
          type: { in: ["CONSULTA", "REUNIAO", "TAREFA"] },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
          // Only surface recurrences that still have at least one future
          // appointment — a BY_DATE recurrence whose endDate is tomorrow but
          // whose last real session was weeks ago shouldn't keep occupying
          // the slot. The remaining time becomes "Disponível".
          appointments: { some: { scheduledAt: { gte: today } } },
          ...(profFilter
            ? {
                AND: [
                  {
                    OR: [
                      { professionalProfileId: profFilter },
                      {
                        additionalProfessionals: {
                          some: { professionalProfileId: profFilter },
                        },
                      },
                    ],
                  },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          type: true,
          title: true,
          recurrenceType: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          duration: true,
          startDate: true,
          endDate: true,
          professionalProfileId: true,
          professionalProfile: { select: { user: { select: { name: true } } } },
          patientId: true,
          patient: { select: { id: true, name: true } },
          additionalProfessionals: {
            select: {
              professionalProfileId: true,
              professionalProfile: { select: { user: { select: { name: true } } } },
            },
          },
          // Earliest still-future appointment for this recurrence — used as
          // the parity / week-of-month anchor so the slot view reflects what
          // the patient is ACTUALLY scheduled for, not where the recurrence
          // row's startDate was originally set. Stays in sync with any swap
          // or per-appointment edit without needing the recurrence row to
          // be touched.
          appointments: {
            where: { scheduledAt: { gte: today } },
            orderBy: { scheduledAt: "asc" },
            take: 1,
            select: { scheduledAt: true },
          },
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      prisma.therapyGroup.findMany({
        where: {
          clinicId: user.clinicId,
          isActive: true,
          ...(profFilter
            ? {
                OR: [
                  { professionalProfileId: profFilter },
                  {
                    additionalProfessionals: {
                      some: { professionalProfileId: profFilter },
                    },
                  },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          dayOfWeek: true,
          startTime: true,
          duration: true,
          recurrenceType: true,
          createdAt: true,
          professionalProfileId: true,
          professionalProfile: { select: { user: { select: { name: true } } } },
          additionalProfessionals: {
            select: {
              professionalProfileId: true,
              professionalProfile: { select: { user: { select: { name: true } } } },
            },
          },
          memberships: {
            where: { leaveDate: null },
            select: { id: true },
          },
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
    ])

    // Rewrite startDate on AppointmentRecurrence rows to the next-upcoming
    // appointment's date. That keeps the parity / week-of-month derivation
    // aligned with the actual schedule after any swap or single-day edit.
    // Falls back to the original startDate when no future appointment exists
    // (shouldn't happen since the WHERE clause already requires one).
    const recurrenceRows = rows.map((r) => {
      const { appointments, ...rest } = r
      const nextScheduled = appointments[0]?.scheduledAt
      return {
        ...rest,
        startDate: nextScheduled ?? r.startDate,
      }
    })

    // Project TherapyGroup rows into the same shape as AppointmentRecurrence
    // rows so the frontend renders them through the same grouping/layout path.
    // Use a synthetic `type: "GROUP"` to differentiate (classifyRecurrenceKind
    // maps this to its own kind).
    const groupRows = groups.map((g) => ({
      id: `group-${g.id}`,
      type: "GROUP",
      title: g.name,
      recurrenceType: g.recurrenceType,
      dayOfWeek: g.dayOfWeek,
      startTime: g.startTime,
      endTime: addMinutes(g.startTime, g.duration),
      duration: g.duration,
      startDate: g.createdAt,
      endDate: null,
      professionalProfileId: g.professionalProfileId,
      professionalProfile: g.professionalProfile,
      patientId: null,
      patient: null,
      additionalProfessionals: g.additionalProfessionals,
      groupMemberCount: g.memberships.length,
    }))

    return NextResponse.json({ recurrences: [...recurrenceRows, ...groupRows] })
  },
)
