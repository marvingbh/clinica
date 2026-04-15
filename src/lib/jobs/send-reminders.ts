/**
 * Pure business logic for the send-reminders cron job.
 *
 * These functions contain no Prisma calls or side effects — they are
 * extracted from the API route so they can be tested in isolation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientConsent {
  consentWhatsApp: boolean
  phone: string | null
  consentEmail: boolean
  email: string | null
}

export interface ConsentResult {
  whatsapp: boolean
  email: boolean
}

export interface ReminderWindow {
  windowStart: Date
  windowEnd: Date
}

export interface ReminderAppointment {
  id: string
  scheduledAt: Date | string
  modality: string | null
  professionalProfile: { user: { name: string } }
  clinic: { name: string }
}

export interface ReminderPatient {
  name: string
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Calculate the time window for appointments that need a reminder.
 *
 * The window starts at `now + hoursBeforeAppointment` and spans exactly 1 hour
 * to align with the hourly cron schedule.
 */
export function calculateReminderWindow(
  now: Date,
  hoursBeforeAppointment: number
): ReminderWindow {
  const windowStart = new Date(now.getTime() + hoursBeforeAppointment * 60 * 60 * 1000)
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000)
  return { windowStart, windowEnd }
}

/**
 * Check whether a patient has consented to receive reminders on each channel.
 *
 * WhatsApp requires both `consentWhatsApp` and a non-null `phone`.
 * Email requires both `consentEmail` and a non-null `email`.
 */
export function hasPatientConsent(patient: PatientConsent): ConsentResult {
  return {
    whatsapp: patient.consentWhatsApp && patient.phone != null,
    email: patient.consentEmail && patient.email != null,
  }
}

/**
 * Determine whether a recent reminder already exists within the deduplication
 * window (default 12 hours). Used to prevent duplicate sends when the cron
 * fires more than once in the same window.
 */
export function hasRecentReminder(
  notifications: Array<{ createdAt: Date | string }>,
  now: Date,
  deduplicationWindowMs: number = 12 * 60 * 60 * 1000
): boolean {
  return notifications.some((n) => {
    const timeSinceCreated = now.getTime() - new Date(n.createdAt).getTime()
    return timeSinceCreated < deduplicationWindowMs
  })
}

/**
 * Build the template variables used to render reminder notifications.
 *
 * Returns a flat Record<string, string> suitable for template substitution.
 */
export function buildReminderTemplateVariables(
  appointment: ReminderAppointment,
  patient: ReminderPatient,
  clinic: { name: string },
  baseUrl: string,
  confirmLink: string,
  cancelLink: string
): Record<string, string> {
  const scheduledDate = new Date(appointment.scheduledAt)
  return {
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
    clinicName: clinic.name,
    modality: appointment.modality === "ONLINE" ? "Online" : "Presencial",
  }
}

/**
 * Return the effective reminder hours for a clinic.
 *
 * Falls back to [48, 2] when the clinic has not configured custom hours.
 */
export function getDefaultReminderHours(clinicHours: number[]): number[] {
  return clinicHours.length > 0 ? clinicHours : [48, 2]
}
