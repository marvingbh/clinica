import { Appointment } from "./types"

/**
 * Formats a time string to HH:mm format
 */
export function formatTime(time: string): string {
  return time.slice(0, 5)
}

/**
 * Formats a date for the header with relative day names
 */
export function formatDateHeader(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dateOnly = new Date(date)
  dateOnly.setHours(0, 0, 0, 0)

  const diffDays = Math.round((dateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  const dayName = date.toLocaleDateString("pt-BR", { weekday: "long" })
  const formattedDate = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  if (diffDays === 0) return `Hoje, ${formattedDate}`
  if (diffDays === 1) return `Amanha, ${formattedDate}`
  if (diffDays === -1) return `Ontem, ${formattedDate}`

  return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${formattedDate}`
}

/**
 * Formats a phone number for display
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

/**
 * Converts a Date to YYYY-MM-DD string (using local timezone)
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Adds months to a date, keeping the same day of month
 */
export function addMonthsToDate(date: Date, months: number): Date {
  const result = new Date(date)
  const targetMonth = result.getMonth() + months
  const targetDay = result.getDate()
  result.setMonth(targetMonth)
  if (result.getDate() !== targetDay) {
    result.setDate(0)
  }
  return result
}

/**
 * Checks if an appointment can be cancelled
 */
export function canCancelAppointment(appointment: Appointment | null): boolean {
  if (!appointment) return false
  return ["AGENDADO", "CONFIRMADO"].includes(appointment.status)
}

/**
 * Checks if patient has notification consent
 */
export function hasNotificationConsent(appointment: Appointment | null): boolean {
  if (!appointment) return false
  if (appointment.type !== "CONSULTA" || !appointment.patient) return false
  return !!(appointment.patient.consentWhatsApp || appointment.patient.consentEmail)
}

/**
 * Checks if appointment can be marked as finalized or no-show
 */
export function canMarkStatus(appointment: Appointment | null): boolean {
  if (!appointment) return false
  return ["AGENDADO", "CONFIRMADO"].includes(appointment.status)
}

/**
 * Checks if can resend confirmation
 */
export function canResendConfirmation(appointment: Appointment | null): boolean {
  if (!appointment) return false
  if (appointment.type !== "CONSULTA" || !appointment.patient) return false
  if (!["AGENDADO", "CONFIRMADO"].includes(appointment.status)) return false
  return !!(
    (appointment.patient.consentWhatsApp && appointment.patient.phone) ||
    (appointment.patient.consentEmail && appointment.patient.email)
  )
}

/**
 * Checks if a date is an exception in the recurrence
 */
export function isDateException(appointment: Appointment | null): boolean {
  if (!appointment?.recurrence) return false
  const dateStr = new Date(appointment.scheduledAt).toISOString().split("T")[0]
  return appointment.recurrence.exceptions?.includes(dateStr) ?? false
}

/**
 * Gets the start of the week (Monday) for a given date
 */
export function getWeekStart(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay()
  // If Sunday (0), go back 6 days. Otherwise, go back (day - 1) days
  const diff = day === 0 ? 6 : day - 1
  result.setDate(result.getDate() - diff)
  return result
}

/**
 * Gets the end of the week (Sunday) for a given date
 */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  const result = new Date(start)
  result.setDate(result.getDate() + 6)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Gets an array of 7 dates for the week starting from the given Monday
 */
export function getWeekDays(startDate: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    days.push(day)
  }
  return days
}

/**
 * Formats a week range for display (e.g., "27 Jan - 02 Fev 2026")
 */
export function formatWeekRange(start: Date, end: Date): string {
  const startDay = start.getDate().toString().padStart(2, "0")
  const endDay = end.getDate().toString().padStart(2, "0")

  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  const startMonth = monthNames[start.getMonth()]
  const endMonth = monthNames[end.getMonth()]

  const startYear = start.getFullYear()
  const endYear = end.getFullYear()

  if (startYear !== endYear) {
    return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`
  }

  if (start.getMonth() !== end.getMonth()) {
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`
  }

  return `${startDay} - ${endDay} ${endMonth} ${endYear}`
}

/**
 * Formats a short day header (e.g., "Seg 27")
 */
export function formatDayHeader(date: Date): { dayName: string; dayNumber: string } {
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
  return {
    dayName: dayNames[date.getDay()],
    dayNumber: date.getDate().toString().padStart(2, "0"),
  }
}

/**
 * Checks if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Checks if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

/**
 * Converts YYYY-MM-DD to DD/MM/YYYY (Brazilian format)
 */
export function toDisplayDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate
  const [year, month, day] = isoDate.split("-")
  return `${day}/${month}/${year}`
}

/**
 * Converts DD/MM/YYYY to YYYY-MM-DD (ISO format)
 */
export function toIsoDate(displayDate: string): string {
  if (!displayDate) return ""
  // If already in ISO format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(displayDate)) return displayDate
  // Convert from DD/MM/YYYY
  const match = displayDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return displayDate
  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

/**
 * Creates a local Date from a date string (DD/MM/YYYY or YYYY-MM-DD) and a time string (HH:MM).
 * Uses explicit Date constructor to avoid timezone ambiguity from string parsing.
 */
export function toLocalDateTime(dateStr: string, timeStr: string): Date {
  const isoDate = toIsoDate(dateStr)
  const [year, month, day] = isoDate.split("-").map(Number)
  const [hours, minutes] = timeStr.split(":").map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

/**
 * Calculates end time given a start time (HH:MM) and duration in minutes.
 * Returns the end time as "HH:MM" or null if inputs are invalid.
 */
export function calculateEndTime(startTime: string, durationMinutes: number | undefined | null): string | null {
  if (!startTime || !durationMinutes) return null
  const match = startTime.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const totalMinutes = Number(match[1]) * 60 + Number(match[2]) + durationMinutes
  const endHours = Math.floor(totalMinutes / 60) % 24
  const endMins = totalMinutes % 60
  return `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`
}

/**
 * Converts a Date to DD/MM/YYYY string (Brazilian format)
 */
export function toDisplayDateFromDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Checks if a time slot is in the past
 * @param selectedDate The date in YYYY-MM-DD format
 * @param slotTime The time in HH:mm format
 */
export function isSlotInPast(selectedDate: string, slotTime: string): boolean {
  const now = new Date()
  const [year, month, day] = selectedDate.split("-").map(Number)
  const [hours, minutes] = slotTime.split(":").map(Number)

  const slotDateTime = new Date(year, month - 1, day, hours, minutes)
  return slotDateTime < now
}
