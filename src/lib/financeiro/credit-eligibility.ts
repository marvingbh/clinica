import type { Prisma } from "@prisma/client"

// Brasília is UTC-3 year-round (Brazil dropped DST in 2019). The invoice
// reference month/year are calendar values in this timezone, so month
// boundaries shift +3h relative to UTC.
const BRASILIA_UTC_OFFSET_HOURS = 3

/** Start of the given Brazilian calendar month, expressed as a UTC Date. */
export function startOfMonthBrasilia(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, BRASILIA_UTC_OFFSET_HOURS, 0, 0))
}

/**
 * Prisma where-fragment restricting SessionCredits to those eligible for an
 * invoice for the given month/year — credits whose origin appointment is
 * strictly before the first day of that calendar month (Brasília). A May/2026
 * invoice can consume April-or-earlier credits, never May credits.
 */
export function creditEligibleForInvoiceMonth(
  year: number,
  month: number,
): Prisma.SessionCreditWhereInput {
  return {
    originAppointment: { scheduledAt: { lt: startOfMonthBrasilia(year, month) } },
  }
}
