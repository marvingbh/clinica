import { describe, it, expect } from "vitest"
import { calculateNextDueDate, generateExpensesFromRecurrence } from "./recurrence"

describe("calculateNextDueDate", () => {
  it("returns next month when current day has passed", () => {
    const result = calculateNextDueDate("MONTHLY", 10, new Date(2026, 2, 15)) // March 15
    expect(result).toEqual(new Date(2026, 3, 10)) // April 10
  })

  it("returns same month when current day has not passed", () => {
    const result = calculateNextDueDate("MONTHLY", 20, new Date(2026, 2, 15)) // March 15
    expect(result).toEqual(new Date(2026, 2, 20)) // March 20
  })

  it("clamps day 31 to 28 in February", () => {
    const result = calculateNextDueDate("MONTHLY", 31, new Date(2026, 0, 31)) // Jan 31
    expect(result).toEqual(new Date(2026, 1, 28)) // Feb 28
  })

  it("clamps day 31 to 29 in leap year February", () => {
    const result = calculateNextDueDate("MONTHLY", 31, new Date(2028, 0, 31)) // Jan 31 2028 (leap year)
    expect(result).toEqual(new Date(2028, 1, 29)) // Feb 29
  })

  it("handles year rollover (December → January)", () => {
    const result = calculateNextDueDate("MONTHLY", 5, new Date(2026, 11, 10)) // Dec 10
    expect(result).toEqual(new Date(2027, 0, 5)) // Jan 5
  })

  it("returns next January for YEARLY when current year has passed", () => {
    const result = calculateNextDueDate("YEARLY", 15, new Date(2026, 2, 20)) // March 20
    expect(result).toEqual(new Date(2027, 0, 15)) // Jan 15 next year
  })

  it("returns same January for YEARLY when day not passed", () => {
    const result = calculateNextDueDate("YEARLY", 15, new Date(2026, 0, 10)) // Jan 10
    expect(result).toEqual(new Date(2026, 0, 15)) // Jan 15 same year
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
    startDate: new Date(2026, 0, 1), // Jan 1
    endDate: null,
    lastGeneratedDate: null,
  }

  it("generates 3 months of expenses from start date", () => {
    const upTo = new Date(2026, 2, 31) // March 31
    const result = generateExpensesFromRecurrence(baseRecurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(new Date(2026, 0, 10)) // Jan 10
    expect(result[1].dueDate).toEqual(new Date(2026, 1, 10)) // Feb 10
    expect(result[2].dueDate).toEqual(new Date(2026, 2, 10)) // Mar 10
    expect(result[0].description).toBe("Aluguel")
    expect(result[0].amount).toBe(5000)
    expect(result[0].recurrenceId).toBe("rec-1")
    expect(result[0].status).toBe("OPEN")
  })

  it("skips already-generated dates", () => {
    const recurrence = {
      ...baseRecurrence,
      lastGeneratedDate: new Date(2026, 1, 10), // Feb 10 already generated
    }
    const upTo = new Date(2026, 4, 31) // May 31
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(new Date(2026, 2, 10)) // Mar 10
    expect(result[1].dueDate).toEqual(new Date(2026, 3, 10)) // Apr 10
    expect(result[2].dueDate).toEqual(new Date(2026, 4, 10)) // May 10
  })

  it("respects end date", () => {
    const recurrence = {
      ...baseRecurrence,
      endDate: new Date(2026, 1, 28), // Feb 28
    }
    const upTo = new Date(2026, 5, 30) // June 30
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(2) // Jan + Feb only
  })

  it("returns empty array when upToDate is before startDate", () => {
    const upTo = new Date(2025, 11, 31) // Dec 31 2025
    const result = generateExpensesFromRecurrence(baseRecurrence, upTo)

    expect(result).toHaveLength(0)
  })

  it("handles yearly frequency", () => {
    const recurrence = {
      ...baseRecurrence,
      frequency: "YEARLY" as const,
      dayOfMonth: 15,
      startDate: new Date(2026, 0, 1),
    }
    const upTo = new Date(2028, 5, 30) // June 2028
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(new Date(2026, 0, 15))
    expect(result[1].dueDate).toEqual(new Date(2027, 0, 15))
    expect(result[2].dueDate).toEqual(new Date(2028, 0, 15))
  })

  it("handles day-of-month clamping for short months", () => {
    const recurrence = {
      ...baseRecurrence,
      dayOfMonth: 31,
      startDate: new Date(2026, 0, 1),
    }
    const upTo = new Date(2026, 2, 31)
    const result = generateExpensesFromRecurrence(recurrence, upTo)

    expect(result).toHaveLength(3)
    expect(result[0].dueDate).toEqual(new Date(2026, 0, 31)) // Jan 31
    expect(result[1].dueDate).toEqual(new Date(2026, 1, 28)) // Feb 28
    expect(result[2].dueDate).toEqual(new Date(2026, 2, 31)) // Mar 31
  })
})
