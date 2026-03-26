import { describe, it, expect } from "vitest"
import { aggregateByWeek, aggregateByMonth } from "./aggregation"
import type { CashFlowEntry } from "./types"

const emptyDetails = { invoices: [], expenses: [], repasse: [] }

function makeEntry(date: string, inflow: number, outflow: number, balance: number): CashFlowEntry {
  return { date, inflow, outflow, net: inflow - outflow, runningBalance: balance, details: { ...emptyDetails } }
}

describe("aggregateByWeek", () => {
  it("returns empty for no entries", () => {
    expect(aggregateByWeek([])).toEqual([])
  })

  it("groups entries by week boundary (Monday)", () => {
    // 2026-03-02 is Monday, 2026-03-09 is next Monday
    const entries = [
      makeEntry("2026-03-02", 1000, 500, 500),
      makeEntry("2026-03-03", 2000, 0, 2500),
      makeEntry("2026-03-04", 0, 300, 2200),
      makeEntry("2026-03-09", 500, 100, 2600), // Next Monday
    ]

    const weeks = aggregateByWeek(entries)
    expect(weeks).toHaveLength(2)
    expect(weeks[0].inflow).toBe(3000) // 1000 + 2000
    expect(weeks[0].outflow).toBe(800)  // 500 + 300
    expect(weeks[0].runningBalance).toBe(2200) // Last day of week
    expect(weeks[1].inflow).toBe(500)
  })
})

describe("aggregateByMonth", () => {
  it("returns empty for no entries", () => {
    expect(aggregateByMonth([])).toEqual([])
  })

  it("groups entries by month", () => {
    const entries = [
      makeEntry("2026-03-01", 1000, 500, 500),
      makeEntry("2026-03-15", 2000, 1000, 1500),
      makeEntry("2026-04-01", 3000, 500, 4000),
    ]

    const months = aggregateByMonth(entries)
    expect(months).toHaveLength(2)
    expect(months[0].date).toBe("2026-03-01")
    expect(months[0].inflow).toBe(3000)
    expect(months[0].outflow).toBe(1500)
    expect(months[1].date).toBe("2026-04-01")
    expect(months[1].inflow).toBe(3000)
  })
})
