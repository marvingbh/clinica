import { RecurrenceType } from "@/generated/prisma/client"
import { formatDate } from "@/lib/appointments/recurrence"

export interface SessionDate {
  date: string // YYYY-MM-DD
  scheduledAt: Date
  endAt: Date
}

/**
 * Gets the interval in days between sessions based on recurrence type
 */
function getIntervalDays(recurrenceType: RecurrenceType): number {
  switch (recurrenceType) {
    case RecurrenceType.WEEKLY:
      return 7
    case RecurrenceType.BIWEEKLY:
      return 14
    case RecurrenceType.MONTHLY:
      return 0 // Handled specially - same day of month
    default:
      return 7
  }
}

/**
 * Adds months to a date, keeping the same day of month (or last day if not available)
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const targetMonth = result.getMonth() + months
  const targetDay = result.getDate()

  result.setMonth(targetMonth)

  // If the day changed (e.g., Jan 31 -> Mar 3), adjust to last day of target month
  if (result.getDate() !== targetDay) {
    result.setDate(0) // Go to last day of previous month
  }

  return result
}

/**
 * Finds the first occurrence of a specific day of week on or after a given date
 */
function findFirstDayOfWeek(fromDate: Date, targetDayOfWeek: number): Date {
  const result = new Date(fromDate)
  const currentDay = result.getDay()
  let daysToAdd = targetDayOfWeek - currentDay

  if (daysToAdd < 0) {
    daysToAdd += 7
  }

  result.setDate(result.getDate() + daysToAdd)
  return result
}

/**
 * Calculates all session dates for a therapy group within a date range
 */
export function calculateGroupSessionDates(
  startDate: string | Date,
  endDate: string | Date,
  dayOfWeek: number,
  startTime: string,
  durationMinutes: number,
  recurrenceType: RecurrenceType
): SessionDate[] {
  const dates: SessionDate[] = []

  // Parse dates as local time
  const start = typeof startDate === "string"
    ? new Date(startDate + "T00:00:00")
    : new Date(startDate)
  start.setHours(0, 0, 0, 0)

  const end = typeof endDate === "string"
    ? new Date(endDate + "T23:59:59.999")
    : new Date(endDate)
  end.setHours(23, 59, 59, 999)

  const [hours, minutes] = startTime.split(":").map(Number)

  // Find first occurrence on or after start date
  let currentDate = findFirstDayOfWeek(start, dayOfWeek)

  // For monthly recurrence, track which occurrence of the month we want
  // (e.g., 2nd Thursday = the dayOfWeek on the 2nd week)
  const intervalDays = getIntervalDays(recurrenceType)
  let monthCount = 0

  while (currentDate <= end) {
    // Create scheduled time
    const scheduled = new Date(currentDate)
    scheduled.setHours(hours, minutes, 0, 0)

    const sessionEnd = new Date(scheduled.getTime() + durationMinutes * 60 * 1000)

    dates.push({
      date: formatDate(currentDate),
      scheduledAt: scheduled,
      endAt: sessionEnd,
    })

    // Calculate next date based on recurrence type
    if (recurrenceType === RecurrenceType.MONTHLY) {
      // For monthly, find the same day of week in the next month
      monthCount++
      const nextMonth = addMonths(start, monthCount)
      currentDate = findFirstDayOfWeek(nextMonth, dayOfWeek)

      // If we overshot (next month started mid-week), use the first occurrence
      // of that day in the new month
      const firstOfMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1)
      currentDate = findFirstDayOfWeek(firstOfMonth, dayOfWeek)

      // Adjust to match the original week-of-month if needed
      // For simplicity, we just use the first occurrence of that day each month
    } else {
      // WEEKLY or BIWEEKLY
      currentDate = new Date(currentDate.getTime() + intervalDays * 24 * 60 * 60 * 1000)
    }
  }

  return dates
}

/**
 * Filters session dates to only include those that don't already have appointments
 * for the group
 */
export function filterExistingSessionDates(
  sessionDates: SessionDate[],
  existingSessionTimes: Date[]
): SessionDate[] {
  const existingTimestamps = new Set(
    existingSessionTimes.map(d => d.getTime())
  )

  return sessionDates.filter(
    session => !existingTimestamps.has(session.scheduledAt.getTime())
  )
}
