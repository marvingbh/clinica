import { calculateNextWindowTodoDates } from "./recurrence"
import type { RecurrenceType } from "@prisma/client"

const EXTENSION_THRESHOLD_DAYS = 30 // Extend when within 30 days of last generated date

/**
 * Decides whether an INDEFINITE recurrence needs more occurrences generated.
 * True when the last generated date is null, in the past, or within 30 days of `now`.
 */
export function needsTodoExtension(
  lastGeneratedDate: Date | null,
  startDate: Date,
  now: Date
): boolean {
  if (!lastGeneratedDate) return true
  if (lastGeneratedDate < startDate) return true
  const diffDays = Math.floor((lastGeneratedDate.getTime() - now.getTime()) / 86400000)
  return diffDays < EXTENSION_THRESHOLD_DAYS
}

/**
 * Filter a list of YYYY-MM-DD strings against a recurrence's exception list.
 */
export function filterTodoExceptions(dates: string[], exceptions: string[]): string[] {
  if (exceptions.length === 0) return dates
  const set = new Set(exceptions)
  return dates.filter((d) => !set.has(d))
}

/**
 * Build the next batch of dates for an INDEFINITE todo recurrence.
 * Returns an empty array if no extension is needed.
 */
export function nextBatchForRecurrence(
  effectiveLastDate: Date,
  recurrenceType: RecurrenceType,
  dayOfWeek: number,
  exceptions: string[]
): string[] {
  const candidates = calculateNextWindowTodoDates(effectiveLastDate, recurrenceType, dayOfWeek)
  return filterTodoExceptions(candidates, exceptions)
}
