import { describe, it, expect } from "vitest"
import { calculateNextDueDate, generateExpensesFromRecurrence } from "./recurrence"

// Dates are built in UTC throughout: `dueDate`/`lastGeneratedDate` are Prisma `@db.Date`
// (UTC midnight), and the generator now matches. UTC construction also makes these tests
// timezone-independent.
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day))

describe("calculateNextDueDate", () => {
  it("returns next month when current day has passed", () => {
    const result = calculateNextDueDate("MONTHLY", 10, utc(2026, 2, 15)) // March 15
    expect(result).toEqual(utc(2026, 3, 10)) // April 10
  })

  it("returns same month when current day has not passed", () => {
    const result = calculateNextDueDate("MONTHLY", 20, utc(2026, 2, 15)) // March 15
    expect(result).toEqual(utc(2026, 2, 20)) // March 20
  })

  it("clamps day 31 to 28 in February", () => {
    const result = calculateNextDueDate("MONTHLY", 31, utc(2026, 0, 31)) // Jan 31
    expect(result).toEqual(utc(2026, 1, 28)) // Feb 28
  })

  it("clamps day 31 to 29 in leap year February", () => {
    const result = calculateNextDueDate("MONTHLY", 31, utc(2028, 0, 31)) // Jan 31 2028 (leap year)
    expect(result).toEqual(utc(2028, 1, 29)) // Feb 29
  })

  it("handles year rollover (December → January)", () => {
    const result = calculateNextDueDate("MONTHLY", 5, utc(2026, 11, 10)) // Dec 10
    expect(result).toEqual(utc(2027, 0, 5)) // Jan 5
  })

  it("returns next January for YEARLY when current year has passed", () => {
    const result = calculateNextDueDate("YEARLY", 15, utc(2026, 2, 20)) // March 20
    expect(result).toEqual(utc(2027, 0, 15)) // Jan 15 next year
  })

  it("returns same January for YEARLY when day not passed", () => {
    const result = calculateNextDueDate("YEARLY", 15, utc(2026, 0, 10)) // Jan 10
    expect(result).toEqual(utc(2026, 0, 15)) // Jan 15 same year
  })

  it("returns UTC midnight (not local), so it aligns with @db.Date storage", () => {
    const result = calculateNextDueDate("MONTHLY", 1, utc(2026, 7, 31)) // after Aug 31 UTC
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z")
  })
})

describe("generateExpensesFromRecurrence", () => {
  const baseRecurrence = {
    id: "rec-1",
    clinicId: "clinic-1",
    categoryId: "cat-1",
    description: "Aluguel",
    supplierName: "Imobiliaria ABC",
    amount: 5000,
    paymentMethod: "PIX",
    frequency: "MONTHLY" as const,
    dayOfMonth: 10,
    startDate: utc(2026, 0, 1), // Jan 1
    endDate: null,
    lastGeneratedDate: null,
  }

  it("generates 3 months of expenses from start date", () => {
    const upTo = utc(2026, 2, 31) // March 31
    const result = generateExpensesFromRecurrence(baseRecurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(utc(2026, 0, 10)) // Jan 10
    expect(result[1].dueDate).toEqual(utc(2026, 1, 10)) // Feb 10
    expect(result[2].dueDate).toEqual(utc(2026, 2, 10)) // Mar 10
    expect(result[0].description).toBe("Aluguel")
    expect(result[0].amount).toBe(5000)
    expect(result[0].recurrenceId).toBe("rec-1")
    expect(result[0].status).toBe("OPEN")
  })

  it("skips already-generated dates", () => {
    const recurrence = {
      ...baseRecurrence,
      lastGeneratedDate: utc(2026, 1, 10), // Feb 10 already generated
    }
    const upTo = utc(2026, 4, 31) // May 31
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(utc(2026, 2, 10)) // Mar 10
    expect(result[1].dueDate).toEqual(utc(2026, 3, 10)) // Apr 10
    expect(result[2].dueDate).toEqual(utc(2026, 4, 10)) // May 10
  })

  it("does NOT regenerate the boundary month already covered by lastGeneratedDate", () => {
    // Regression: in BRT (UTC-3) a locally-built "Sep 1" was Sep 1 03:00Z > stored Sep 1 00:00Z,
    // so the skip guard failed and the daily cron re-created Sep 1 on every run.
    const recurrence = {
      ...baseRecurrence,
      dayOfMonth: 1,
      startDate: utc(2026, 3, 1), // Apr 1
      lastGeneratedDate: utc(2026, 8, 1), // Sep 1 already generated (the horizon boundary)
    }
    const upTo = utc(2026, 8, 1) // horizon = Sep 1
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(0) // nothing new — Sep 1 must not be duplicated
  })

  it("respects end date", () => {
    const recurrence = {
      ...baseRecurrence,
      endDate: utc(2026, 1, 28), // Feb 28
    }
    const upTo = utc(2026, 5, 30) // June 30
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(2) // Jan + Feb only
  })

  it("returns empty array when upToDate is before startDate", () => {
    const upTo = utc(2025, 11, 31) // Dec 31 2025
    const result = generateExpensesFromRecurrence(baseRecurrence, upTo)

    expect(result).toHaveLength(0)
  })

  it("handles yearly frequency", () => {
    const recurrence = {
      ...baseRecurrence,
      frequency: "YEARLY" as const,
      dayOfMonth: 15,
      startDate: utc(2026, 0, 1),
    }
    const upTo = utc(2028, 5, 30) // June 2028
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(utc(2026, 0, 15))
    expect(result[1].dueDate).toEqual(utc(2027, 0, 15))
    expect(result[2].dueDate).toEqual(utc(2028, 0, 15))
  })

  it("handles day-of-month clamping for short months", () => {
    const recurrence = {
      ...baseRecurrence,
      dayOfMonth: 31,
      startDate: utc(2026, 0, 1),
    }
    const upTo = utc(2026, 2, 31)
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(utc(2026, 0, 31)) // Jan 31
    expect(result[1].dueDate).toEqual(utc(2026, 1, 28)) // Feb 28
    expect(result[2].dueDate).toEqual(utc(2026, 2, 31)) // Mar 31
  })
})
