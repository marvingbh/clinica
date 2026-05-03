import { NextResponse } from "next/server"
import { Prisma, AppointmentStatus, AppointmentType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"

const DEFAULT_WINDOW_DAYS = 90
const DEFAULT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.AGENDADO,
  AppointmentStatus.CONFIRMADO,
]

const VALID_STATUSES = new Set<AppointmentStatus>(Object.values(AppointmentStatus))

function parseDayParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(value + "T00:00:00")
  return isNaN(d.getTime()) ? null : d
}

function parseStatusList(raw: string | null): AppointmentStatus[] | null {
  if (!raw) return null
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const out: AppointmentStatus[] = []
  for (const item of items) {
    if (!VALID_STATUSES.has(item as AppointmentStatus)) return null
    out.push(item as AppointmentStatus)
  }
  return out.length > 0 ? out : null
}

/**
 * GET /api/appointments/pendencias
 *
 * Lean list of past appointments that are still open (not finalized, not
 * cancelled) — surfaces work the user forgot to close out in the agenda.
 *
 * Query params:
 *   from   YYYY-MM-DD (default: today − 90d)
 *   to     YYYY-MM-DD (default: today)  — exclusive upper bound is "now"
 *   status comma list of AppointmentStatus values (default: AGENDADO,CONFIRMADO)
 *   professionalProfileId  optional; admin only
 *   q      patient name substring (case-insensitive)
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const { searchParams } = new URL(req.url)

    const now = new Date()
    const explicitFrom = parseDayParam(searchParams.get("from"))
    const explicitTo = parseDayParam(searchParams.get("to"))
    const requestedProfId = searchParams.get("professionalProfileId")
    const q = searchParams.get("q")?.trim() ?? ""

    const from = explicitFrom ?? new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 86400_000)
    // upper bound: end of the user-chosen day if explicit, otherwise "now" (so
    // future appointments — even later today — never appear in pendências)
    const to = explicitTo
      ? new Date(explicitTo.getTime() + 86399999)
      : now

    const requestedStatuses = parseStatusList(searchParams.get("status"))
    const statuses = requestedStatuses ?? DEFAULT_STATUSES

    const where: Prisma.AppointmentWhereInput = {
      clinicId: user.clinicId,
      status: { in: statuses },
      scheduledAt: { gte: from, lte: to },
      // Skip non-blocking calendar entries that don't represent visits.
      type: { in: [AppointmentType.CONSULTA, AppointmentType.TAREFA, AppointmentType.REUNIAO] },
    }

    if (!canSeeOthers && user.professionalProfileId) {
      where.OR = [
        { professionalProfileId: user.professionalProfileId },
        { additionalProfessionals: { some: { professionalProfileId: user.professionalProfileId } } },
      ]
    } else if (canSeeOthers && requestedProfId) {
      where.OR = [
        { professionalProfileId: requestedProfId },
        { additionalProfessionals: { some: { professionalProfileId: requestedProfId } } },
      ]
    }

    if (q) {
      where.patient = { name: { contains: q, mode: "insensitive" } }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        scheduledAt: true,
        endAt: true,
        status: true,
        type: true,
        modality: true,
        title: true,
        notes: true,
        patient: { select: { id: true, name: true, phone: true } },
        professionalProfile: {
          select: {
            id: true,
            user: { select: { name: true } },
          },
        },
      },
    })

    return NextResponse.json({ appointments })
  }
)
