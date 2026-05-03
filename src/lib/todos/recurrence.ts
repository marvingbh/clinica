import { RecurrenceType, RecurrenceEndType } from "@prisma/client"
import { formatDay, parseDay } from "./format"

const MAX_OCCURRENCES = 52
const INDEFINITE_WINDOW_MONTHS = 6
const INDEFINITE_EXTENSION_MONTHS = 3

export interface TodoRecurrenceOptions {
  recurrenceType: RecurrenceType
  recurrenceEndType: RecurrenceEndType
  endDate?: string | Date // YYYY-MM-DD or Date
  occurrences?: number
}

export function validateTodoRecurrenceOptions(
  options: TodoRecurrenceOptions
): { valid: boolean; error?: string } {
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
    const end = options.endDate instanceof Date ? options.endDate : parseDay(options.endDate as string)
    if (isNaN(end.getTime())) return { valid: false, error: "Data final invalida" }
  }
  return { valid: true }
}

function addMonthsKeepingDay(date: Date, months: number): Date {
  const result = new Date(date)
  const targetDay = result.getDate()
  result.setMonth(result.getMonth() + months)
  if (result.getDate() !== targetDay) {
    // Snapped forward (e.g. Jan 31 → Mar 3) — clamp to last day of target month.
    result.setDate(0)
  }
  return result
}

/**
 * Compute every occurrence date for a todo recurrence, as YYYY-MM-DD strings.
 * Excludes nothing — pass `exceptions` separately if you need to filter.
 */
export function calculateTodoRecurrenceDates(
  startDate: string | Date,
  options: TodoRecurrenceOptions
): string[] {
  const dates: string[] = []
  const start = typeof startDate === "string" ? parseDay(startDate) : new Date(startDate)
  start.setHours(12, 0, 0, 0)

  dates.push(formatDay(start))

  let maxOccurrences = MAX_OCCURRENCES
  let endDate: Date | null = null

  if (options.recurrenceEndType === RecurrenceEndType.BY_OCCURRENCES && options.occurrences) {
    maxOccurrences = Math.min(options.occurrences, MAX_OCCURRENCES)
  } else if (options.recurrenceEndType === RecurrenceEndType.BY_DATE && options.endDate) {
    endDate = options.endDate instanceof Date ? new Date(options.endDate) : parseDay(options.endDate as string)
    endDate.setHours(23, 59, 59, 999)
  } else if (options.recurrenceEndType === RecurrenceEndType.INDEFINITE) {
    endDate = addMonthsKeepingDay(start, INDEFINITE_WINDOW_MONTHS)
    endDate.setHours(23, 59, 59, 999)
  }

  let count = 1
  while (count < maxOccurrences) {
    let current: Date
    if (options.recurrenceType === RecurrenceType.MONTHLY) {
      current = addMonthsKeepingDay(start, count)
    } else {
      const intervalDays = options.recurrenceType === RecurrenceType.BIWEEKLY ? 14 : 7
      current = new Date(start.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
    }
    if (endDate && current > endDate) break
    dates.push(formatDay(current))
    count++
  }

  return dates
}

/**
 * Compute the next batch of dates beyond `lastGeneratedDate` for an INDEFINITE
 * recurrence — used by the cron extension job.
 */
export function calculateNextWindowTodoDates(
  lastGeneratedDate: string | Date,
  recurrenceType: RecurrenceType,
  dayOfWeek: number,
  extensionMonths: number = INDEFINITE_EXTENSION_MONTHS
): string[] {
  const dates: string[] = []
  const last = typeof lastGeneratedDate === "string" ? parseDay(lastGeneratedDate) : new Date(lastGeneratedDate)
  last.setHours(12, 0, 0, 0)

  const endDate = addMonthsKeepingDay(last, extensionMonths)
  endDate.setHours(23, 59, 59, 999)

  let count = 1
  while (true) {
    let current: Date
    if (recurrenceType === RecurrenceType.MONTHLY) {
      current = addMonthsKeepingDay(last, count)
    } else {
      const intervalDays = recurrenceType === RecurrenceType.BIWEEKLY ? 14 : 7
      current = new Date(last.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
    }
    if (current > endDate) break
    if (recurrenceType !== RecurrenceType.MONTHLY && current.getDay() !== dayOfWeek) {
      count++
      continue
    }
    dates.push(formatDay(current))
    count++
  }

  return dates
}

export function formatTodoRecurrenceSummary(
  recurrenceType: RecurrenceType,
  recurrenceEndType: RecurrenceEndType,
  occurrences?: number | null,
  endDate?: string | Date | null
): string {
  const labels: Record<RecurrenceType, string> = {
    [RecurrenceType.WEEKLY]: "Semanal",
    [RecurrenceType.BIWEEKLY]: "Quinzenal",
    [RecurrenceType.MONTHLY]: "Mensal",
  }
  let summary = labels[recurrenceType]
  if (recurrenceEndType === RecurrenceEndType.BY_OCCURRENCES && occurrences) {
    summary += ` - ${occurrences} ocorrencias`
  } else if (recurrenceEndType === RecurrenceEndType.BY_DATE && endDate) {
    const end = endDate instanceof Date ? endDate : parseDay(endDate)
    summary += ` - ate ${end.toLocaleDateString("pt-BR")}`
  } else if (recurrenceEndType === RecurrenceEndType.INDEFINITE) {
    summary += ` - sem data de fim`
  }
  return summary
}
