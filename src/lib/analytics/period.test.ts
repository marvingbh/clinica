import { describe, it, expect } from "vitest"
import { resolvePeriod, prevPeriod, periodLabel, monthsInRange } from "./period"

describe("resolvePeriod", () => {
  it("resolves a month to a half-open range", () => {
    const r = resolvePeriod({ year: 2026, month: 5 })
    expect(r.start.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(r.end.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("handles February in a leap year (end is March 1)", () => {
    const r = resolvePeriod({ year: 2024, month: 2 })
    expect(r.start.toISOString()).toBe("2024-02-01T00:00:00.000Z")
    expect(r.end.toISOString()).toBe("2024-03-01T00:00:00.000Z")
  })

  it("resolves a quarter (Q2 = Apr-Jun)", () => {
    const r = resolvePeriod({ year: 2026, quarter: 2 })
    expect(r.start.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(r.end.toISOString()).toBe("2026-07-01T00:00:00.000Z")
  })

  it("resolves Q4 ending in the next year", () => {
    const r = resolvePeriod({ year: 2026, quarter: 4 })
    expect(r.start.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(r.end.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("resolves the whole year when neither month nor quarter is set", () => {
    const r = resolvePeriod({ year: 2026 })
    expect(r.start.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(r.end.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("month wins over quarter when both present", () => {
    const r = resolvePeriod({ year: 2026, month: 3, quarter: 4 })
    expect(r.start.toISOString()).toBe("2026-03-01T00:00:00.000Z")
    expect(r.end.toISOString()).toBe("2026-04-01T00:00:00.000Z")
  })
})

describe("prevPeriod", () => {
  it("steps back a month within the year", () => {
    expect(prevPeriod({ year: 2026, month: 5 })).toEqual({ year: 2026, month: 4 })
  })

  it("steps back across the year for January", () => {
    expect(prevPeriod({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 })
  })

  it("steps back a quarter within the year", () => {
    expect(prevPeriod({ year: 2026, quarter: 3 })).toEqual({ year: 2026, quarter: 2 })
  })

  it("steps back across the year for Q1", () => {
    expect(prevPeriod({ year: 2026, quarter: 1 })).toEqual({ year: 2025, quarter: 4 })
  })

  it("steps back a year for year granularity", () => {
    expect(prevPeriod({ year: 2026 })).toEqual({ year: 2025 })
  })
})

describe("periodLabel", () => {
  it("formats a month in pt-BR", () => {
    expect(periodLabel({ year: 2026, month: 5 })).toBe("Maio 2026")
  })

  it("formats a quarter in pt-BR", () => {
    expect(periodLabel({ year: 2026, quarter: 2 })).toBe("2º trimestre 2026")
  })

  it("formats a year", () => {
    expect(periodLabel({ year: 2026 })).toBe("2026")
  })
})

describe("monthsInRange", () => {
  it("enumerates a single month", () => {
    const r = resolvePeriod({ year: 2026, month: 5 })
    expect(monthsInRange(r)).toEqual([{ year: 2026, month: 5 }])
  })

  it("enumerates a quarter", () => {
    const r = resolvePeriod({ year: 2026, quarter: 2 })
    expect(monthsInRange(r)).toEqual([
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
    ])
  })

  it("enumerates a full year (12 months)", () => {
    const r = resolvePeriod({ year: 2026 })
    const months = monthsInRange(r)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ year: 2026, month: 1 })
    expect(months[11]).toEqual({ year: 2026, month: 12 })
  })
})
