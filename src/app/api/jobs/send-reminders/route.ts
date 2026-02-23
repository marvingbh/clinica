import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  AppointmentStatus,
  NotificationChannel,
  NotificationType,
} from "@prisma/client"
import { createNotification, processPendingNotifications, getPatientPhoneNumbers } from "@/lib/notifications"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { buildConfirmUrl, buildCancelUrl } from "@/lib/appointments/appointment-links"

/**
 * POST /api/jobs/send-reminders
 * Vercel Cron job to send automatic appointment reminders
 *
 * Runs every hour via Vercel Cron configuration.
 * Finds appointments needing reminders based on clinic's reminderHours setting.
 *
 * Features:
 * - Configurable reminder timing per clinic (default: 48h and 2h before)
 * - Idempotent: checks for existing reminders before sending
 * - Respects patient consent preferences (LGPD compliance)
 * - Only sends for AGENDADO or CONFIRMADO appointments
 * - Creates audit logs for execution tracking
 */
export async function GET(req: Request) {
  // Verify Vercel Cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const results = {
    clinicsProcessed: 0,
    appointmentsFound: 0,
    remindersCreated: 0,
    remindersSent: 0,
    skippedAlreadySent: 0,
    skippedNoConsent: 0,
    errors: [] as string[],
  }

  try {
    // Get all active clinics
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        timezone: true,
        reminderHours: true,
      },
    })

    for (const clinic of clinics) {
      try {
        const clinicResults = await processClinicReminders(clinic)
        results.clinicsProcessed++
        results.appointmentsFound += clinicResults.appointmentsFound
        results.remindersCreated += clinicResults.remindersCreated
        results.skippedAlreadySent += clinicResults.skippedAlreadySent
        results.skippedNoConsent += clinicResults.skippedNoConsent
      } catch (error) {
        const errorMsg = `Clinic ${clinic.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        results.errors.push(errorMsg)
        console.error(`[send-reminders] Error processing clinic ${clinic.id}:`, error)
      }
    }

    // Process any pending notifications that are ready to send
    const notificationsSent = await processPendingNotifications(50)
    results.remindersSent = notificationsSent

    // Log execution to AuditLog for each clinic
    for (const clinic of clinics) {
      await prisma.auditLog.create({
        data: {
          clinicId: clinic.id,
          userId: null, // System job
          action: "REMINDER_JOB_EXECUTED",
          entityType: "CronJob",
          entityId: "send-reminders",
          newValues: {
            executionTime: Date.now() - startTime,
            results: {
              appointmentsFound: results.appointmentsFound,
              remindersCreated: results.remindersCreated,
              remindersSent: results.remindersSent,
              skippedAlreadySent: results.skippedAlreadySent,
              skippedNoConsent: results.skippedNoConsent,
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
    console.error("[send-reminders] Critical error:", error)
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

interface ClinicInfo {
  id: string
  name: string
  timezone: string
  reminderHours: number[]
}

interface ClinicResults {
  appointmentsFound: number
  remindersCreated: number
  skippedAlreadySent: number
  skippedNoConsent: number
}

/**
 * Process reminders for a single clinic
 */
async function processClinicReminders(clinic: ClinicInfo): Promise<ClinicResults> {
  const results: ClinicResults = {
    appointmentsFound: 0,
    remindersCreated: 0,
    skippedAlreadySent: 0,
    skippedNoConsent: 0,
  }

  // Get reminder hours (default to 48h and 2h if not set)
  const reminderHours = clinic.reminderHours.length > 0 ? clinic.reminderHours : [48, 2]

  // For each reminder window, find appointments that need reminders
  for (const hours of reminderHours) {
    const windowResults = await findAndCreateReminders(clinic, hours)
    results.appointmentsFound += windowResults.appointmentsFound
    results.remindersCreated += windowResults.remindersCreated
    results.skippedAlreadySent += windowResults.skippedAlreadySent
    results.skippedNoConsent += windowResults.skippedNoConsent
  }

  return results
}

/**
 * Find appointments within a reminder window and create reminders
 */
async function findAndCreateReminders(
  clinic: ClinicInfo,
  hoursBeforeAppointment: number
): Promise<ClinicResults> {
  const results: ClinicResults = {
    appointmentsFound: 0,
    remindersCreated: 0,
    skippedAlreadySent: 0,
    skippedNoConsent: 0,
  }

  const now = new Date()
  // Calculate the window: appointments that are hoursBeforeAppointment away
  // We check a 1-hour window to account for hourly cron runs
  const windowStart = new Date(now.getTime() + hoursBeforeAppointment * 60 * 60 * 1000)
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000) // +1 hour

  // Find appointments in the reminder window (only CONSULTA type)
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: clinic.id,
      type: "CONSULTA",
      scheduledAt: {
        gte: windowStart,
        lt: windowEnd,
      },
      status: {
        in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
      },
    },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          consentWhatsApp: true,
          consentEmail: true,
        },
      },
      professionalProfile: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
      clinic: {
        select: { name: true },
      },
      notifications: {
        where: {
          type: NotificationType.APPOINTMENT_REMINDER,
        },
        select: {
          id: true,
          channel: true,
          createdAt: true,
        },
      },
    },
  })

  results.appointmentsFound = appointments.length

  for (const appointment of appointments) {
    const patient = appointment.patient
    if (!patient) continue // Skip entries without patients (shouldn't happen with type filter)

    // Check patient consent
    const hasWhatsAppConsent = patient.consentWhatsApp && patient.phone
    const hasEmailConsent = patient.consentEmail && patient.email

    if (!hasWhatsAppConsent && !hasEmailConsent) {
      results.skippedNoConsent++
      continue
    }

    // Check if reminder already sent for this window
    // We check if a reminder was sent in the last 12 hours to prevent duplicates
    const existingReminders = appointment.notifications

    // Check if we've already sent a reminder in the last 12 hours for this appointment
    // This prevents duplicate reminders if cron runs multiple times
    const recentReminder = existingReminders.find((n) => {
      const timeSinceCreated = now.getTime() - new Date(n.createdAt).getTime()
      return timeSinceCreated < 12 * 60 * 60 * 1000 // 12 hours
    })

    if (recentReminder) {
      results.skippedAlreadySent++
      continue
    }

    // Build notification content using templates
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    const confirmLink = buildConfirmUrl(baseUrl, appointment.id, new Date(appointment.scheduledAt))
    const cancelLink = buildCancelUrl(baseUrl, appointment.id, new Date(appointment.scheduledAt))

    const scheduledDate = new Date(appointment.scheduledAt)
    const templateVariables = {
      patientName: patient.name,
      professionalName: appointment.professionalProfile.user.name,
      date: scheduledDate.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      time: scheduledDate.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      confirmLink,
      cancelLink,
      clinicName: appointment.clinic.name,
      modality: appointment.modality === "ONLINE" ? "Online" : "Presencial",
    }

    // Send WhatsApp notification to all phone numbers if consent exists
    if (hasWhatsAppConsent) {
      try {
        const template = await getTemplate(
          clinic.id,
          NotificationType.APPOINTMENT_REMINDER,
          NotificationChannel.WHATSAPP
        )
        const content = renderTemplate(template.content, templateVariables)

        const phoneNumbers = await getPatientPhoneNumbers(patient.id, clinic.id)
        for (const { phone } of phoneNumbers) {
          await createNotification({
            clinicId: clinic.id,
            patientId: patient.id,
            appointmentId: appointment.id,
            type: NotificationType.APPOINTMENT_REMINDER,
            channel: NotificationChannel.WHATSAPP,
            recipient: phone,
            content,
          })
          results.remindersCreated++
        }
      } catch (error) {
        console.error(
          `[send-reminders] Error creating WhatsApp reminder for appointment ${appointment.id}:`,
          error
        )
      }
    }

    // Send Email notification if consent exists
    if (hasEmailConsent) {
      try {
        const template = await getTemplate(
          clinic.id,
          NotificationType.APPOINTMENT_REMINDER,
          NotificationChannel.EMAIL
        )
        const content = renderTemplate(template.content, templateVariables)
        const subject = template.subject
          ? renderTemplate(template.subject, templateVariables)
          : `Lembrete de Consulta - ${appointment.clinic.name}`

        await createNotification({
          clinicId: clinic.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          type: NotificationType.APPOINTMENT_REMINDER,
          channel: NotificationChannel.EMAIL,
          recipient: patient.email!,
          subject,
          content,
        })
        results.remindersCreated++
      } catch (error) {
        console.error(
          `[send-reminders] Error creating Email reminder for appointment ${appointment.id}:`,
          error
        )
      }
    }
  }

  return results
}

// Also support POST for testing purposes (same behavior)
export { GET as POST }
