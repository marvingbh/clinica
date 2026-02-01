import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { RecurrenceEndType, AppointmentStatus } from "@prisma/client/client"
import { calculateNextWindowDates } from "@/lib/appointments"
import { createAppointmentTokens } from "@/lib/appointments"

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

        // Check if we need to extend (if lastGeneratedDate is within 2 months from now)
        const now = new Date()
        const twoMonthsFromNow = new Date(now)
        twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2)

        const lastGenerated = recurrence.lastGeneratedDate
          ? new Date(recurrence.lastGeneratedDate)
          : new Date(recurrence.startDate)

        // Only extend if the last generated date is less than 2 months away
        if (lastGenerated > twoMonthsFromNow) {
          results.recurrencesSkipped++
          continue
        }

        // Calculate new appointment dates (next 3 months from lastGeneratedDate)
        const newDates = calculateNextWindowDates(
          lastGenerated,
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
        const validDates = newDates.filter(
          (d) => !recurrence.exceptions.includes(d.date)
        )

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
        const bufferMs = (recurrence.professionalProfile.bufferBetweenSlots || 0) * 60 * 1000
        const nonConflictingDates = validDates.filter((newDate) => {
          return !existingAppointments.some((existing) => {
            const existingStart = new Date(existing.scheduledAt).getTime() - bufferMs
            const existingEnd = new Date(existing.endAt).getTime() + bufferMs
            const newStart = newDate.scheduledAt.getTime()
            const newEnd = newDate.endAt.getTime()
            return newStart < existingEnd && newEnd > existingStart
          })
        })

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

        // Create new appointments in a transaction
        await prisma.$transaction(async (tx) => {
          for (const dateInfo of nonConflictingDates) {
            // Create the appointment
            const newAppointment = await tx.appointment.create({
              data: {
                clinicId: recurrence.clinicId,
                professionalProfileId: recurrence.professionalProfileId,
                patientId: recurrence.patientId,
                recurrenceId: recurrence.id,
                scheduledAt: dateInfo.scheduledAt,
                endAt: dateInfo.endAt,
                modality: recurrence.modality,
                status: AppointmentStatus.AGENDADO,
              },
            })

            // Create tokens for confirm/cancel actions
            await createAppointmentTokens(newAppointment.id, dateInfo.scheduledAt, tx)

            results.appointmentsCreated++
          }

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
