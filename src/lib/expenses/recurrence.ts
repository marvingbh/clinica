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
 */
export function calculateNextDueDate(
  frequency: ExpenseFrequency,
  dayOfMonth: number,
  afterDate: Date
): Date {
  const year = afterDate.getFullYear()
  const month = afterDate.getMonth()

  if (frequency === "YEARLY") {
    // Next occurrence is January of the next year (or same year if afterDate is before Jan dayOfMonth)
    const thisYear = new Date(year, 0, Math.min(dayOfMonth, daysInMonth(year, 0)))
    if (thisYear > afterDate) return thisYear
    const nextYear = year + 1
    return new Date(nextYear, 0, Math.min(dayOfMonth, daysInMonth(nextYear, 0)))
  }

  // MONTHLY: find the next month where dayOfMonth hasn't passed yet
  const thisMonth = new Date(year, month, Math.min(dayOfMonth, daysInMonth(year, month)))
  if (thisMonth > afterDate) return thisMonth

  const nextMonth = month + 1
  const nextDate = new Date(year, nextMonth, 1) // handles year rollover
  return new Date(
    nextDate.getFullYear(),
    nextDate.getMonth(),
    Math.min(dayOfMonth, daysInMonth(nextDate.getFullYear(), nextDate.getMonth()))
  )
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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
