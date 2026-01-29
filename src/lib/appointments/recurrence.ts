import { RecurrenceType, RecurrenceEndType } from "@/generated/prisma/client"

export interface RecurrenceOptions {
  recurrenceType: RecurrenceType
  recurrenceEndType: RecurrenceEndType
  endDate?: Date | string
  occurrences?: number
}

export interface RecurrenceDate {
  date: string // YYYY-MM-DD
  scheduledAt: Date
  endAt: Date
}

const MAX_OCCURRENCES = 52 // Maximum 1 year weekly
const INDEFINITE_WINDOW_MONTHS = 6 // Rolling window for INDEFINITE recurrences

/**
 * Validates recurrence options
 */
export function validateRecurrenceOptions(options: RecurrenceOptions): { valid: boolean; error?: string } {
  if (options.recurrenceEndType === RecurrenceEndType.BY_OCCURRENCES) {
    if (!options.occurrences || options.occurrences < 1) {
      return { valid: false, error: "Numero de ocorrencias deve ser pelo menos 1" }
    }
    if (options.occurrences > MAX_OCCURRENCES) {
      return { valid: false, error: `Maximo de ${MAX_OCCURRENCES} ocorrencias permitido` }
    }
  } else if (options.recurrenceEndType === RecurrenceEndType.BY_DATE) {
    if (!options.endDate) {
      return { valid: false, error: "Data final e obrigatoria para recorrencia por data" }
    }
    const end = new Date(options.endDate)
    if (isNaN(end.getTime())) {
      return { valid: false, error: "Data final invalida" }
    }
  }
  // INDEFINITE type does not require endDate or occurrences

  return { valid: true }
}

/**
 * Gets the interval in days between occurrences based on recurrence type
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
 * Calculates all occurrence dates for a recurring appointment
 */
export function calculateRecurrenceDates(
  startDate: Date | string,
  startTime: string,
  durationMinutes: number,
  options: RecurrenceOptions
): RecurrenceDate[] {
  const dates: RecurrenceDate[] = []
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)

  const [hours, minutes] = startTime.split(":").map(Number)

  // Calculate first occurrence
  const firstScheduled = new Date(start)
  firstScheduled.setHours(hours, minutes, 0, 0)

  const firstEnd = new Date(firstScheduled.getTime() + durationMinutes * 60 * 1000)

  dates.push({
    date: formatDate(start),
    scheduledAt: firstScheduled,
    endAt: firstEnd,
  })

  // Calculate subsequent occurrences
  const intervalDays = getIntervalDays(options.recurrenceType)
  let currentDate = new Date(start)
  let count = 1

  // Determine end condition
  let maxOccurrences = MAX_OCCURRENCES
  let endDate: Date | null = null

  if (options.recurrenceEndType === RecurrenceEndType.BY_OCCURRENCES && options.occurrences) {
    maxOccurrences = Math.min(options.occurrences, MAX_OCCURRENCES)
  } else if (options.recurrenceEndType === RecurrenceEndType.BY_DATE && options.endDate) {
    endDate = new Date(options.endDate)
    endDate.setHours(23, 59, 59, 999)
  } else if (options.recurrenceEndType === RecurrenceEndType.INDEFINITE) {
    // For INDEFINITE, use rolling window of 6 months from start date
    endDate = addMonths(new Date(start), INDEFINITE_WINDOW_MONTHS)
    endDate.setHours(23, 59, 59, 999)
  }

  while (count < maxOccurrences) {
    // Calculate next date
    if (options.recurrenceType === RecurrenceType.MONTHLY) {
      currentDate = addMonths(start, count)
    } else {
      currentDate = new Date(start.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
    }

    // Check end date condition
    if (endDate && currentDate > endDate) {
      break
    }

    // Create scheduled time
    const scheduled = new Date(currentDate)
    scheduled.setHours(hours, minutes, 0, 0)

    const end = new Date(scheduled.getTime() + durationMinutes * 60 * 1000)

    dates.push({
      date: formatDate(currentDate),
      scheduledAt: scheduled,
      endAt: end,
    })

    count++
  }

  return dates
}

/**
 * Formats a date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Calculates next window of dates for INDEFINITE recurrences (for cron job extension)
 */
export function calculateNextWindowDates(
  lastGeneratedDate: Date | string,
  startTime: string,
  durationMinutes: number,
  recurrenceType: RecurrenceType,
  dayOfWeek: number,
  extensionMonths: number = 3
): RecurrenceDate[] {
  const dates: RecurrenceDate[] = []
  const lastDate = new Date(lastGeneratedDate)
  lastDate.setHours(0, 0, 0, 0)

  const [hours, minutes] = startTime.split(":").map(Number)

  // Calculate end date (extension window)
  const endDate = addMonths(lastDate, extensionMonths)
  endDate.setHours(23, 59, 59, 999)

  const intervalDays = getIntervalDays(recurrenceType)
  let currentDate = new Date(lastDate)
  let count = 1

  while (true) {
    // Calculate next date
    if (recurrenceType === RecurrenceType.MONTHLY) {
      currentDate = addMonths(lastDate, count)
    } else {
      currentDate = new Date(lastDate.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
    }

    // Check end date condition
    if (currentDate > endDate) {
      break
    }

    // Only add if it matches the day of week (for WEEKLY/BIWEEKLY)
    if (recurrenceType !== RecurrenceType.MONTHLY && currentDate.getDay() !== dayOfWeek) {
      count++
      continue
    }

    // Create scheduled time
    const scheduled = new Date(currentDate)
    scheduled.setHours(hours, minutes, 0, 0)

    const end = new Date(scheduled.getTime() + durationMinutes * 60 * 1000)

    dates.push({
      date: formatDate(currentDate),
      scheduledAt: scheduled,
      endAt: end,
    })

    count++
  }

  return dates
}

/**
 * Formats recurrence summary for display
 */
export function formatRecurrenceSummary(
  recurrenceType: RecurrenceType,
  recurrenceEndType: RecurrenceEndType,
  occurrences?: number,
  endDate?: Date | string
): string {
  const typeLabels: Record<RecurrenceType, string> = {
    [RecurrenceType.WEEKLY]: "Semanal",
    [RecurrenceType.BIWEEKLY]: "Quinzenal",
    [RecurrenceType.MONTHLY]: "Mensal",
  }

  let summary = typeLabels[recurrenceType]

  if (recurrenceEndType === RecurrenceEndType.BY_OCCURRENCES && occurrences) {
    summary += ` - ${occurrences} sessoes`
  } else if (recurrenceEndType === RecurrenceEndType.BY_DATE && endDate) {
    const end = new Date(endDate)
    summary += ` - ate ${end.toLocaleDateString("pt-BR")}`
  } else if (recurrenceEndType === RecurrenceEndType.INDEFINITE) {
    summary += ` - sem data de fim`
  }

  return summary
}

/**
 * Checks if a date is in the exceptions list
 */
export function isDateException(date: Date | string, exceptions: string[]): boolean {
  const dateStr = typeof date === "string" ? date : formatDate(date)
  return exceptions.includes(dateStr)
}

/**
 * Adds a date to the exceptions list (skip a date)
 * Returns new exceptions array
 */
export function addException(date: Date | string, exceptions: string[]): string[] {
  const dateStr = typeof date === "string" ? date : formatDate(date)
  if (exceptions.includes(dateStr)) {
    return exceptions // Already an exception
  }
  return [...exceptions, dateStr].sort()
}

/**
 * Removes a date from the exceptions list (unskip a date)
 * Returns new exceptions array
 */
export function removeException(date: Date | string, exceptions: string[]): string[] {
  const dateStr = typeof date === "string" ? date : formatDate(date)
  return exceptions.filter((d) => d !== dateStr)
}

/**
 * Calculates recurrence dates excluding exceptions
 * Returns dates with an isException flag for display purposes
 */
export interface RecurrenceDateWithException extends RecurrenceDate {
  isException: boolean
}

export function calculateRecurrenceDatesWithExceptions(
  startDate: Date | string,
  startTime: string,
  durationMinutes: number,
  options: RecurrenceOptions,
  exceptions: string[] = []
): RecurrenceDateWithException[] {
  const dates = calculateRecurrenceDates(startDate, startTime, durationMinutes, options)
  return dates.map((d) => ({
    ...d,
    isException: isDateException(d.date, exceptions),
  }))
}

/**
 * Counts active (non-exception) occurrences
 */
export function countActiveOccurrences(
  startDate: Date | string,
  startTime: string,
  durationMinutes: number,
  options: RecurrenceOptions,
  exceptions: string[] = []
): number {
  const dates = calculateRecurrenceDatesWithExceptions(
    startDate,
    startTime,
    durationMinutes,
    options,
    exceptions
  )
  return dates.filter((d) => !d.isException).length
}
