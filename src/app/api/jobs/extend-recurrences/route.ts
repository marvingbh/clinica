import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { RecurrenceEndType, AppointmentStatus } from "@prisma/client"
import { calculateNextWindowDates, blocksTimeForType } from "@/lib/appointments"
import {
  needsExtension,
  filterExceptions,
  filterConflicts,
  buildAppointmentData,
} from "@/lib/jobs/extend-recurrences"
import {
  needsTodoExtension,
  nextBatchForRecurrence as nextBatchForTodoRecurrence,
  parseDay,
} from "@/lib/todos"

/**
 * GET /api/jobs/extend-recurrences
 * Vercel Cron job to extend INDEFINITE recurrences
 *
 * Runs daily in its OWN cron slot (the agenda is the critical flow, so it is
 * never queued behind slower maintenance jobs). For each active INDEFINITE
 * recurrence: checks if appointments need generating, generates the next 3
 * months, and updates lastGeneratedDate.
 *
 * Schedule: 0 2 * * * (every day at 2:00 AM UTC)
 */

// This job iterates every clinic's recurrences; give it the full Hobby budget.
export const maxDuration = 60

export async function GET(req: Request) {
  // Verify Vercel Cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const results = {
    recurrencesProcessed: 0,
    appointmentsCreated: 0,
    recurrencesSkipped: 0,
    todoRecurrencesProcessed: 0,
    todosCreated: 0,
    todoRecurrencesSkipped: 0,
    errors: [] as string[],
  }

  try {
    // Find all active INDEFINITE recurrences
    const recurrences = await prisma.appointmentRecurrence.findMany({
      where: {
        recurrenceEndType: RecurrenceEndType.INDEFINITE,
        isActive: true,
      },
      include: {
        clinic: {
          select: {
            id: true,
            isActive: true,
          },
        },
        professionalProfile: {
          select: {
            id: true,
            bufferBetweenSlots: true,
          },
        },
      },
    })

    // Batch-fetch the latest appointment per recurrence in ONE query
    // (Postgres DISTINCT ON, via Prisma distinct + ordering) instead of a
    // findFirst per recurrence. With hundreds of recurrences and ~100ms of
    // round-trip latency each, the old per-recurrence query was the bulk of
    // the cron's runtime and pushed it past the serverless time limit.
    //
    // Anchor source-of-truth = the actual latest appointment row, NOT
    // recurrence.lastGeneratedDate. A "Trocar semana quinzenal" swap (or any
    // per-appointment edit) shifts appointment dates but does NOT touch the
    // recurrence row — so trusting lastGeneratedDate would extend on the OLD
    // cycle and put new sessions on the wrong week.
    const now = new Date()
    const latestRows = await prisma.appointment.findMany({
      where: { recurrenceId: { in: recurrences.map((r) => r.id) } },
      distinct: ["recurrenceId"],
      orderBy: [{ recurrenceId: "asc" }, { scheduledAt: "desc" }],
      select: {
        recurrenceId: true,
        scheduledAt: true,
        endAt: true,
        type: true,
        title: true,
        blocksTime: true,
        modality: true,
      },
    })
    const latestByRecurrence = new Map(
      latestRows.map((row) => [row.recurrenceId, row])
    )

    for (const recurrence of recurrences) {
      try {
        // Skip if clinic is inactive
        if (!recurrence.clinic.isActive) {
          results.recurrencesSkipped++
          continue
        }

        const lastAppointment = latestByRecurrence.get(recurrence.id) ?? null
        const lastApptDate = lastAppointment?.scheduledAt ?? null
        const startDate = new Date(recurrence.startDate)

        if (!needsExtension(lastApptDate, startDate, now)) {
          results.recurrencesSkipped++
          continue
        }

        // Session shape (type/title/duration/blocksTime/modality) is cloned
        // from the actual latest appointment — same source-of-truth rationale
        // as the date anchor above. The recurrence row's `duration` can drift
        // out of sync with its real sessions (e.g. an edited end time), and it
        // doesn't carry type/title at all, so trusting it would turn a titled
        // REUNIAO into an untitled CONSULTA on the wrong duration.
        const durationMinutes = lastAppointment
          ? Math.round(
              (lastAppointment.endAt.getTime() -
                lastAppointment.scheduledAt.getTime()) /
                60000
            )
          : recurrence.duration
        const entryType = lastAppointment?.type ?? recurrence.type
        const entryTitle = lastAppointment?.title ?? recurrence.title
        const entryBlocksTime =
          lastAppointment?.blocksTime ?? blocksTimeForType(recurrence.type)
        const entryModality =
          lastAppointment?.modality ?? recurrence.modality ?? "PRESENCIAL"

        // Calculate new appointment dates (next 3 months from the actual
        // last appointment, falling back to startDate when none exist yet).
        const effectiveDate = lastApptDate ?? startDate
        const newDates = calculateNextWindowDates(
          effectiveDate,
          recurrence.startTime,
          durationMinutes,
          recurrence.recurrenceType,
          recurrence.dayOfWeek,
          3 // 3 months extension
        )

        if (newDates.length === 0) {
          results.recurrencesSkipped++
          continue
        }

        // Filter out dates that are in the exceptions list
        const validDates = filterExceptions(newDates, recurrence.exceptions)

        if (validDates.length === 0) {
          results.recurrencesSkipped++
          continue
        }

        // Check for conflicts with existing appointments
        const existingAppointments = await prisma.appointment.findMany({
          where: {
            professionalProfileId: recurrence.professionalProfileId,
            scheduledAt: {
              gte: validDates[0].scheduledAt,
              lte: validDates[validDates.length - 1].endAt,
            },
            status: {
              in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
            },
          },
          select: {
            scheduledAt: true,
            endAt: true,
          },
        })

        // Filter out dates that conflict with existing appointments
        const bufferMinutes = recurrence.professionalProfile.bufferBetweenSlots || 0
        const nonConflictingDates = filterConflicts(
          validDates,
          existingAppointments,
          bufferMinutes
        )

        if (nonConflictingDates.length === 0) {
          // Update lastGeneratedDate even if no appointments created (to prevent re-checking)
          await prisma.appointmentRecurrence.update({
            where: { id: recurrence.id },
            data: {
              lastGeneratedDate: new Date(validDates[validDates.length - 1].date),
            },
          })
          results.recurrencesSkipped++
          continue
        }

        // Build appointment data and bulk create in a transaction
        const appointmentData = buildAppointmentData(nonConflictingDates, {
          id: recurrence.id,
          clinicId: recurrence.clinicId,
          professionalProfileId: recurrence.professionalProfileId,
          patientId: recurrence.patientId,
          modality: entryModality,
          type: entryType,
          title: entryTitle,
          blocksTime: entryBlocksTime,
        })

        await prisma.$transaction(async (tx) => {
          await tx.appointment.createMany({ data: appointmentData })

          results.appointmentsCreated += nonConflictingDates.length

          // Update lastGeneratedDate
          await tx.appointmentRecurrence.update({
            where: { id: recurrence.id },
            data: {
              lastGeneratedDate: new Date(nonConflictingDates[nonConflictingDates.length - 1].date),
            },
          })
        })

        results.recurrencesProcessed++
      } catch (error) {
        const errorMsg = `Recurrence ${recurrence.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        results.errors.push(errorMsg)
        console.error(`[extend-recurrences] Error processing recurrence ${recurrence.id}:`, error)
      }
    }

    // ----- Extend INDEFINITE todo recurrences -----
    const todoRecurrences = await prisma.todoRecurrence.findMany({
      where: {
        recurrenceEndType: RecurrenceEndType.INDEFINITE,
        isActive: true,
      },
      include: { clinic: { select: { id: true, isActive: true } } },
    })

    for (const rec of todoRecurrences) {
      try {
        if (!rec.clinic.isActive) {
          results.todoRecurrencesSkipped++
          continue
        }
        const now = new Date()
        const lastGenerated = rec.lastGeneratedDate ? new Date(rec.lastGeneratedDate) : null
        const startDate = new Date(rec.startDate)
        if (!needsTodoExtension(lastGenerated, startDate, now)) {
          results.todoRecurrencesSkipped++
          continue
        }

        const effectiveDate = lastGenerated ?? startDate
        const newDates = nextBatchForTodoRecurrence(
          effectiveDate,
          rec.recurrenceType,
          rec.dayOfWeek,
          rec.exceptions
        )
        if (newDates.length === 0) {
          results.todoRecurrencesSkipped++
          continue
        }

        await prisma.$transaction(async (tx) => {
          await tx.todo.createMany({
            data: newDates.map((iso) => ({
              clinicId: rec.clinicId,
              professionalProfileId: rec.professionalProfileId,
              recurrenceId: rec.id,
              title: rec.title,
              notes: rec.notes,
              day: parseDay(iso),
              done: false,
            })),
            // Partial unique index on (recurrenceId, day) makes this safe
            // against retries / partial failures.
            skipDuplicates: true,
          })
          await tx.todoRecurrence.update({
            where: { id: rec.id },
            data: { lastGeneratedDate: parseDay(newDates[newDates.length - 1]) },
          })
        })

        results.todosCreated += newDates.length
        results.todoRecurrencesProcessed++
      } catch (error) {
        results.errors.push(
          `TodoRecurrence ${rec.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        )
        console.error(`[extend-recurrences] Error processing todo recurrence ${rec.id}:`, error)
      }
    }

    // Log execution to AuditLog for tracking
    const clinicIds = [...new Set([
      ...recurrences.map((r) => r.clinicId),
      ...todoRecurrences.map((r) => r.clinicId),
    ])]
    for (const clinicId of clinicIds) {
      await prisma.auditLog.create({
        data: {
          clinicId,
          userId: null, // System job
          action: "EXTEND_RECURRENCES_JOB_EXECUTED",
          entityType: "CronJob",
          entityId: "extend-recurrences",
          newValues: {
            executionTime: Date.now() - startTime,
            results: {
              recurrencesProcessed: results.recurrencesProcessed,
              appointmentsCreated: results.appointmentsCreated,
              recurrencesSkipped: results.recurrencesSkipped,
              todoRecurrencesProcessed: results.todoRecurrencesProcessed,
              todosCreated: results.todosCreated,
              todoRecurrencesSkipped: results.todoRecurrencesSkipped,
              errorsCount: results.errors.length,
            },
          },
        },
      })
    }

    return NextResponse.json({
      success: true,
      executionTimeMs: Date.now() - startTime,
      ...results,
    })
  } catch (error) {
    console.error("[extend-recurrences] Critical error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: Date.now() - startTime,
        ...results,
      },
      { status: 500 }
    )
  }
}

// Also support POST for testing purposes (same behavior)
export { GET as POST }
