import type { ExpenseFrequency } from "@prisma/client"
import type { CreateExpenseInput } from "./types"

interface RecurrenceTemplate {
  clinicId: string
  id: string
  categoryId: string | null
  description: string
  supplierName: string | null
  amount: number
  paymentMethod: string | null
  frequency: ExpenseFrequency
  dayOfMonth: number
  startDate: Date
  endDate: Date | null
  lastGeneratedDate: Date | null
}

/**
 * Calculate the next due date for a given frequency and day of month,
 * starting after `afterDate`. Handles month-end clamping (e.g., day 31 in Feb → 28/29).
 *
 * All dates are built in UTC to align with how `dueDate` / `lastGeneratedDate` are stored
 * (Prisma `@db.Date`, read back as UTC midnight). Using local-time constructors here caused a
 * boundary bug in negative-offset timezones (e.g. BRT, UTC-3): a locally-built "Sep 1" is
 * `Sep 1 03:00Z`, always greater than the stored `Sep 1 00:00Z`, so the "skip already generated"
 * guard never fired and the daily cron re-created the same expense every run.
 */
export function calculateNextDueDate(
  frequency: ExpenseFrequency,
  dayOfMonth: number,
  afterDate: Date
): Date {
  const year = afterDate.getUTCFullYear()
  const month = afterDate.getUTCMonth()

  if (frequency === "YEARLY") {
    // Next occurrence is January of the next year (or same year if afterDate is before Jan dayOfMonth)
    const thisYear = utcDate(year, 0, Math.min(dayOfMonth, daysInMonth(year, 0)))
    if (thisYear > afterDate) return thisYear
    return utcDate(year + 1, 0, Math.min(dayOfMonth, daysInMonth(year + 1, 0)))
  }

  // MONTHLY: find the next month where dayOfMonth hasn't passed yet
  const thisMonth = utcDate(year, month, Math.min(dayOfMonth, daysInMonth(year, month)))
  if (thisMonth > afterDate) return thisMonth

  // Advance one month, handling year rollover
  const nextYear = month === 11 ? year + 1 : year
  const nextMonth = month === 11 ? 0 : month + 1
  return utcDate(nextYear, nextMonth, Math.min(dayOfMonth, daysInMonth(nextYear, nextMonth)))
}

/**
 * Generate expense inputs from a recurrence template, from `lastGeneratedDate`
 * (or `startDate` if never generated) up to `upToDate`.
 */
export function generateExpensesFromRecurrence(
  recurrence: RecurrenceTemplate,
  upToDate: Date
): CreateExpenseInput[] {
  const expenses: CreateExpenseInput[] = []
  const effectiveStart = recurrence.lastGeneratedDate ?? recurrence.startDate
  // Start generating from the day before effectiveStart so calculateNextDueDate
  // returns the first valid date after it
  let cursor = new Date(effectiveStart.getTime() - 24 * 60 * 60 * 1000)

  // Safety limit to prevent infinite loops
  const maxIterations = 36

  for (let i = 0; i < maxIterations; i++) {
    const nextDate = calculateNextDueDate(
      recurrence.frequency,
      recurrence.dayOfMonth,
      cursor
    )

    if (nextDate > upToDate) break
    if (recurrence.endDate && nextDate > recurrence.endDate) break
    // Skip dates at or before the last generated date
    if (recurrence.lastGeneratedDate && nextDate <= recurrence.lastGeneratedDate) {
      cursor = nextDate
      continue
    }
    // Skip dates before the start date
    if (nextDate < recurrence.startDate) {
      cursor = nextDate
      continue
    }

    expenses.push({
      clinicId: recurrence.clinicId,
      description: recurrence.description,
      supplierName: recurrence.supplierName,
      categoryId: recurrence.categoryId,
      amount: recurrence.amount,
      dueDate: nextDate,
      status: "OPEN",
      paymentMethod: recurrence.paymentMethod,
      recurrenceId: recurrence.id,
    })

    cursor = nextDate
  }

  return expenses
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}
