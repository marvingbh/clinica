import { describe, it, expect } from "vitest"
import {
  validateTodoRecurrenceOptions,
  calculateTodoRecurrenceDates,
  calculateNextWindowTodoDates,
  formatTodoRecurrenceSummary,
} from "./recurrence"

describe("todos/recurrence/validate", () => {
  it("requires occurrences for BY_OCCURRENCES", () => {
    expect(validateTodoRecurrenceOptions({ recurrenceType: "WEEKLY", recurrenceEndType: "BY_OCCURRENCES" }).valid).toBe(false)
    expect(validateTodoRecurrenceOptions({ recurrenceType: "WEEKLY", recurrenceEndType: "BY_OCCURRENCES", occurrences: 0 }).valid).toBe(false)
    expect(validateTodoRecurrenceOptions({ recurrenceType: "WEEKLY", recurrenceEndType: "BY_OCCURRENCES", occurrences: 5 }).valid).toBe(true)
  })

  it("caps occurrences at the maximum", () => {
    expect(validateTodoRecurrenceOptions({ recurrenceType: "WEEKLY", recurrenceEndType: "BY_OCCURRENCES", occurrences: 200 }).valid).toBe(false)
  })

  it("requires endDate for BY_DATE", () => {
    expect(validateTodoRecurrenceOptions({ recurrenceType: "WEEKLY", recurrenceEndType: "BY_DATE" }).valid).toBe(false)
    expect(validateTodoRecurrenceOptions({ recurrenceType: "WEEKLY", recurrenceEndType: "BY_DATE", endDate: "2026-12-31" }).valid).toBe(true)
  })

  it("INDEFINITE needs nothing else", () => {
    expect(validateTodoRecurrenceOptions({ recurrenceType: "WEEKLY", recurrenceEndType: "INDEFINITE" }).valid).toBe(true)
  })
})

describe("todos/recurrence/dates", () => {
  it("WEEKLY BY_OCCURRENCES generates N weekly dates", () => {
    const dates = calculateTodoRecurrenceDates("2026-05-04", {
      recurrenceType: "WEEKLY",
      recurrenceEndType: "BY_OCCURRENCES",
      occurrences: 4,
    })
    expect(dates).toEqual(["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"])
  })

  it("BIWEEKLY BY_OCCURRENCES generates N every-other-week dates", () => {
    const dates = calculateTodoRecurrenceDates("2026-05-04", {
      recurrenceType: "BIWEEKLY",
      recurrenceEndType: "BY_OCCURRENCES",
      occurrences: 3,
    })
    expect(dates).toEqual(["2026-05-04", "2026-05-18", "2026-06-01"])
  })

  it("MONTHLY BY_OCCURRENCES preserves day-of-month", () => {
    const dates = calculateTodoRecurrenceDates("2026-01-31", {
      recurrenceType: "MONTHLY",
      recurrenceEndType: "BY_OCCURRENCES",
      occurrences: 4,
    })
    // Feb 31 → clamp to Feb 28; March back to 31; April clamp to 30.
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"])
  })

  it("BY_DATE stops at endDate inclusive", () => {
    const dates = calculateTodoRecurrenceDates("2026-05-04", {
      recurrenceType: "WEEKLY",
      recurrenceEndType: "BY_DATE",
      endDate: "2026-05-25",
    })
    expect(dates).toEqual(["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"])
  })

  it("INDEFINITE generates a 6-month rolling window", () => {
    const dates = calculateTodoRecurrenceDates("2026-05-04", {
      recurrenceType: "WEEKLY",
      recurrenceEndType: "INDEFINITE",
    })
    expect(dates[0]).toBe("2026-05-04")
    expect(dates.length).toBeGreaterThan(20)
    expect(dates.length).toBeLessThanOrEqual(27)
    expect(dates[dates.length - 1] <= "2026-11-04").toBe(true)
  })
})

describe("todos/recurrence/extend", () => {
  it("extends WEEKLY past the last generated date by 3 months", () => {
    const dates = calculateNextWindowTodoDates("2026-05-04", "WEEKLY", 1)
    expect(dates[0]).toBe("2026-05-11")
    expect(dates.length).toBeGreaterThan(10)
    expect(dates.length).toBeLessThanOrEqual(13)
  })

  it("MONTHLY extension adds month-by-month occurrences", () => {
    const dates = calculateNextWindowTodoDates("2026-05-04", "MONTHLY", 1)
    expect(dates).toEqual(["2026-06-04", "2026-07-04", "2026-08-04"])
  })
})

describe("todos/recurrence/summary", () => {
  it("formats human-readable Portuguese", () => {
    expect(formatTodoRecurrenceSummary("WEEKLY", "INDEFINITE")).toBe("Semanal - sem data de fim")
    expect(formatTodoRecurrenceSummary("BIWEEKLY", "BY_OCCURRENCES", 5)).toBe("Quinzenal - 5 ocorrencias")
    expect(formatTodoRecurrenceSummary("MONTHLY", "BY_DATE", null, "2026-12-31")).toMatch(/Mensal - ate /)
  })
})
