/**
 * Pure business logic for the extend-recurrences cron job.
 *
 * Extracted from the API route so it can be tested without Prisma or HTTP.
 */

export interface DateInfo {
  date: string // YYYY-MM-DD
  scheduledAt: Date
  endAt: Date
}

export interface RecurrenceInfo {
  id: string
  clinicId: string
  professionalProfileId: string
  patientId: string | null
  modality: string
}

export interface AppointmentData {
  clinicId: string
  professionalProfileId: string
  patientId: string | null
  recurrenceId: string
  scheduledAt: Date
  endAt: Date
  modality: string
  status: "AGENDADO"
}

/**
 * Determines whether a recurrence needs extension.
 *
 * Uses lastGeneratedDate when available, otherwise falls back to startDate.
 * Returns true if the effective date is within 2 months from `now`.
 */
export function needsExtension(
  lastGeneratedDate: Date | null,
  startDate: Date,
  now: Date
): boolean {
  const effectiveDate = lastGeneratedDate ?? startDate
  const twoMonthsFromNow = new Date(now)
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2)
  return effectiveDate <= twoMonthsFromNow
}

/**
 * Filters out dates that appear in the exceptions list.
 */
export function filterExceptions(
  dates: DateInfo[],
  exceptions: string[]
): DateInfo[] {
  return dates.filter((d) => !exceptions.includes(d.date))
}

/**
 * Filters out dates that overlap with existing appointments (including buffer).
 *
 * Overlap logic: newStart < existingEnd + buffer AND newEnd > existingStart - buffer
 */
export function filterConflicts(
  dates: DateInfo[],
  existingAppointments: Array<{ scheduledAt: Date; endAt: Date }>,
  bufferMinutes: number
): DateInfo[] {
  const bufferMs = bufferMinutes * 60 * 1000
  return dates.filter((newDate) => {
    return !existingAppointments.some((existing) => {
      const existingStart =
        new Date(existing.scheduledAt).getTime() - bufferMs
      const existingEnd = new Date(existing.endAt).getTime() + bufferMs
      const newStart = newDate.scheduledAt.getTime()
      const newEnd = newDate.endAt.getTime()
      return newStart < existingEnd && newEnd > existingStart
    })
  })
}

/**
 * Maps date infos to appointment creation data for a given recurrence.
 */
export function buildAppointmentData(
  dates: DateInfo[],
  recurrence: RecurrenceInfo
): AppointmentData[] {
  return dates.map((dateInfo) => ({
    clinicId: recurrence.clinicId,
    professionalProfileId: recurrence.professionalProfileId,
    patientId: recurrence.patientId,
    recurrenceId: recurrence.id,
    scheduledAt: dateInfo.scheduledAt,
    endAt: dateInfo.endAt,
    modality: recurrence.modality,
    status: "AGENDADO" as const,
  }))
}
