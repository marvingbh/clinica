import { describe, it, expect } from "vitest"
import { computeWaitlistMetrics } from "./metrics"

const now = new Date("2026-06-15T12:00:00.000Z")

describe("computeWaitlistMetrics", () => {
  it("counts waiting entries", () => {
    const m = computeWaitlistMetrics({
      activeEntries: [{ createdAt: now }, { createdAt: now }],
      offers: [],
      conversions: [],
      now,
    })
    expect(m.waiting).toBe(2)
  })

  it("computes avgWaitDays from createdAt", () => {
    const m = computeWaitlistMetrics({
      activeEntries: [
        { createdAt: new Date("2026-06-05T12:00:00.000Z") }, // 10 days
        { createdAt: new Date("2026-06-11T12:00:00.000Z") }, // 4 days
      ],
      offers: [],
      conversions: [],
      now,
    })
    expect(m.avgWaitDays).toBe(7)
  })

  it("avgWaitDays is 0 with no active entries (no NaN)", () => {
    const m = computeWaitlistMetrics({ activeEntries: [], offers: [], conversions: [], now })
    expect(m.avgWaitDays).toBe(0)
  })

  it("conversionRate is ACEITA / ENVIADA over the period", () => {
    const m = computeWaitlistMetrics({
      activeEntries: [],
      offers: [
        { status: "ACEITA", createdAt: now },
        { status: "EXPIRADA", createdAt: now },
        { status: "ENVIADA", createdAt: now },
        { status: "ACEITA", createdAt: now },
      ],
      conversions: [],
      now,
    })
    expect(m.offersSent30d).toBe(4)
    expect(m.conversionRate).toBe(0.5)
  })

  it("conversionRate is 0 with no offers (no NaN)", () => {
    const m = computeWaitlistMetrics({ activeEntries: [], offers: [], conversions: [], now })
    expect(m.conversionRate).toBe(0)
    expect(Number.isNaN(m.conversionRate)).toBe(false)
  })

  it("revenueRecovered sums sessionFee treating null as 0", () => {
    const m = computeWaitlistMetrics({
      activeEntries: [],
      offers: [],
      conversions: [{ sessionFee: 150 }, { sessionFee: null }, { sessionFee: 200 }],
      now,
    })
    expect(m.revenueRecovered).toBe(350)
  })
})
