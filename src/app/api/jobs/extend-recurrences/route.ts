import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { RecurrenceEndType, AppointmentStatus } from "@prisma/client"
import { calculateNextWindowDates } from "@/lib/appointments"
import {
  needsExtension,
  filterExceptions,
  filterConflicts,
  buildAppointmentData,
} from "@/lib/jobs/extend-recurrences"

/**
 * GET /api/jobs/extend-recurrences
 * Vercel Cron job to extend INDEFINITE recurrences
 *
 * Runs weekly (every Monday at 2am) via Vercel Cron configuration.
 * For each active INDEFINITE recurrence:
 * - Checks if appointments need to be generated
 * - Generates next 3 months of appointments
 * - Updates lastGeneratedDate
 *
 * Schedule: 0 2 * * 1 (every Monday at 2:00 AM)
 */
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

    for (const recurrence of recurrences) {
      try {
        // Skip if clinic is inactive
        if (!recurrence.clinic.isActive) {
          results.recurrencesSkipped++
          continue
        }

        // Check if we need to extend
        const now = new Date()
        const lastGenerated = recurrence.lastGeneratedDate
          ? new Date(recurrence.lastGeneratedDate)
          : null
        const startDate = new Date(recurrence.startDate)

        if (!needsExtension(lastGenerated, startDate, now)) {
          results.recurrencesSkipped++
          continue
        }

        // Calculate new appointment dates (next 3 months from lastGeneratedDate)
        const effectiveDate = lastGenerated ?? startDate
        const newDates = calculateNextWindowDates(
          effectiveDate,
          recurrence.startTime,
          recurrence.duration,
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
          modality: recurrence.modality ?? "PRESENCIAL" as const,
        })

        await prisma.$transaction(async (tx) => {
          await tx.appointment.createMany({ data: appointmentData })

          // Fetch created appointment IDs for token creation
          await tx.appointment.findMany({
            where: {
              recurrenceId: recurrence.id,
              scheduledAt: {
                gte: nonConflictingDates[0].scheduledAt,
                lte: nonConflictingDates[nonConflictingDates.length - 1].scheduledAt,
              },
            },
            select: { id: true, scheduledAt: true },
            orderBy: { scheduledAt: "asc" },
          })

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

    // Log execution to AuditLog for tracking
    const clinicIds = [...new Set(recurrences.map((r) => r.clinicId))]
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
