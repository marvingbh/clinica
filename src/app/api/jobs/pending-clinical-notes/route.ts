import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  filterPendingAppointments,
  buildPendingTodoInput,
  type PendingAppointment,
} from "@/lib/prontuario"

const LOOKBACK_DAYS = 14
const MIN_HOURS = 24

/**
 * GET /api/jobs/pending-clinical-notes
 * Creates idempotent Todos for FINALIZADO CONSULTAs (last 14d, >24h ago)
 * without a clinical note from the executing professional.
 *
 * Schedule: 0 9 * * * (09:00 UTC = 06:00 BRT)
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)
  const lookbackStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const cutoff = new Date(now.getTime() - MIN_HOURS * 60 * 60 * 1000)

  try {
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    let totalCreated = 0

    for (const clinic of clinics) {
      const appts = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          type: "CONSULTA",
          status: "FINALIZADO",
          patientId: { not: null },
          scheduledAt: { gte: lookbackStart, lte: cutoff },
        },
        select: {
          id: true,
          patientId: true,
          scheduledAt: true,
          status: true,
          type: true,
          professionalProfileId: true,
          attendingProfessionalId: true,
          patient: { select: { name: true } },
        },
      })
      if (appts.length === 0) continue

      const existingNotes = await prisma.clinicalNote.findMany({
        where: { clinicId: clinic.id, appointmentId: { in: appts.map((a) => a.id) } },
        select: { appointmentId: true },
      })
      const existingApptIds = new Set(
        existingNotes.map((n) => n.appointmentId).filter((id): id is string => id !== null)
      )

      const pendingInput: PendingAppointment[] = appts.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        patientName: a.patient?.name ?? null,
        scheduledAt: a.scheduledAt,
        status: a.status,
        type: a.type,
        professionalProfileId: a.professionalProfileId,
        attendingProfessionalId: a.attendingProfessionalId,
      }))

      const pending = filterPendingAppointments(pendingInput, existingApptIds, now, {
        minHoursSinceSession: MIN_HOURS,
        lookbackDays: LOOKBACK_DAYS,
      })
      if (pending.length === 0) continue

      const result = await prisma.todo.createMany({
        data: pending.map((p) => {
          const input = buildPendingTodoInput(p, todayIso)
          return {
            clinicId: clinic.id,
            professionalProfileId: input.professionalProfileId,
            title: input.title,
            day: new Date(`${input.day}T00:00:00.000Z`),
            sourceAppointmentId: input.sourceAppointmentId,
          }
        }),
        skipDuplicates: true,
      })
      totalCreated += result.count

      if (result.count > 0) {
        await prisma.auditLog
          .create({
            data: {
              clinicId: clinic.id,
              userId: null,
              action: "PENDING_NOTES_JOB_EXECUTED",
              entityType: "ClinicalNote",
              entityId: "batch",
              newValues: { created: result.count, candidates: pending.length },
            },
          })
          .catch(() => {})
      }
    }

    return NextResponse.json({
      success: true,
      executionTimeMs: Date.now() - startTime,
      todosCreated: totalCreated,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

export { GET as POST }
