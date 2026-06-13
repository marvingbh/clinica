import { describe, it, expect } from "vitest"
import { buildComparisonRows } from "./comparison"
import type { CancellationBreakdown } from "./cancellations"
import { emptyCancelRecord } from "./types"

function breakdown(total: number, cancelled: number): CancellationBreakdown {
  const byStatus = emptyCancelRecord()
  byStatus.CANCELADO_FALTA = cancelled
  return { total, cancelled, rate: total === 0 ? 0 : cancelled / total, byStatus }
}

describe("buildComparisonRows", () => {
  it("merges sources per professional", () => {
    const rows = buildComparisonRows({
      profs: [{ id: "p1", name: "Dr. Ana" }],
      occupancyByProf: new Map([["p1", { available: 600, booked: 300 }]]),
      cancelByProf: new Map([["p1", breakdown(10, 2)]]),
      sessionsByProf: new Map([["p1", 8]]),
      rebookingByProf: new Map([["p1", 0.75]]),
      revenueByProf: new Map([["p1", { revenue: 4000, sessions: 8 }]]),
    })
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.name).toBe("Dr. Ana")
    expect(r.occupancy).toBe(0.5)
    expect(r.sessions).toBe(8)
    expect(r.cancellationRate).toBeCloseTo(0.2, 5)
    expect(r.rebooking7).toBe(0.75)
    expect(r.revenue).toBe(4000)
    expect(r.avgTicket).toBe(500)
  })

  it("yields null occupancy when no availability is configured", () => {
    const rows = buildComparisonRows({
      profs: [{ id: "p1", name: "Dr. Ana" }],
      occupancyByProf: new Map([["p1", { available: 0, booked: 120 }]]),
      cancelByProf: new Map(),
      sessionsByProf: new Map(),
      rebookingByProf: new Map(),
      revenueByProf: new Map(),
    })
    expect(rows[0].occupancy).toBeNull()
  })

  it("keeps revenue/avgTicket null in own-scope (revenueByProf = null)", () => {
    const rows = buildComparisonRows({
      profs: [{ id: "p1", name: "Dr. Ana" }],
      occupancyByProf: new Map([["p1", { available: 600, booked: 300 }]]),
      cancelByProf: new Map([["p1", breakdown(10, 2)]]),
      sessionsByProf: new Map([["p1", 8]]),
      rebookingByProf: new Map([["p1", 0.5]]),
      revenueByProf: null,
    })
    expect(rows[0].revenue).toBeNull()
    expect(rows[0].avgTicket).toBeNull()
  })

  it("defaults missing maps to safe zeros", () => {
    const rows = buildComparisonRows({
      profs: [{ id: "p1", name: "Dr. Ana" }],
      occupancyByProf: new Map(),
      cancelByProf: new Map(),
      sessionsByProf: new Map(),
      rebookingByProf: new Map(),
      revenueByProf: new Map(),
    })
    const r = rows[0]
    expect(r.availableMinutes).toBe(0)
    expect(r.bookedMinutes).toBe(0)
    expect(r.occupancy).toBeNull()
    expect(r.sessions).toBe(0)
    expect(r.cancellationRate).toBe(0)
    expect(r.rebooking7).toBeNull()
    expect(r.revenue).toBe(0)
    expect(r.avgTicket).toBeNull()
  })
})
