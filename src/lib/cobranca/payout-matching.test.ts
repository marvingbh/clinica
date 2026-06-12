import { describe, it, expect } from "vitest"
import {
  isStripePayoutDescription,
  matchStripePayout,
  type PayoutCandidate,
} from "./payout-matching"

describe("isStripePayoutDescription", () => {
  it("detects STRIPE in various forms", () => {
    expect(isStripePayoutDescription("STRIPE")).toBe(true)
    expect(isStripePayoutDescription("stripe holanda")).toBe(true)
    expect(isStripePayoutDescription("Transferência STRIPE TECHNOLOGY")).toBe(true)
  })

  it("ignores ordinary descriptions", () => {
    expect(isStripePayoutDescription("PIX recebido João")).toBe(false)
    expect(isStripePayoutDescription("TED Maria Santos")).toBe(false)
  })
})

describe("matchStripePayout", () => {
  const day = (iso: string) => new Date(iso)
  const candidates: PayoutCandidate[] = [
    { chargeId: "c1", netAmount: 100, paidAt: day("2026-06-10T12:00:00Z") },
    { chargeId: "c2", netAmount: 195.5, paidAt: day("2026-06-11T09:00:00Z") },
  ]

  it("matches when the sum equals the payout exactly", () => {
    const res = matchStripePayout(295.5, candidates, day("2026-06-12T00:00:00Z"))
    expect(res.matched).toBe(true)
    expect(res.chargeIds).toEqual(["c1", "c2"])
    expect(res.difference).toBe(0)
  })

  it("matches within 1 cent tolerance", () => {
    const res = matchStripePayout(295.49, candidates, day("2026-06-12T00:00:00Z"))
    expect(res.matched).toBe(true)
    expect(res.difference).toBeCloseTo(0.01, 2)
  })

  it("reports the difference when it does not match", () => {
    const res = matchStripePayout(250, candidates, day("2026-06-12T00:00:00Z"))
    expect(res.matched).toBe(false)
    expect(res.difference).toBe(45.5)
    expect(res.chargeIds).toEqual(["c1", "c2"])
  })

  it("ignores candidates paid after the payout date", () => {
    const res = matchStripePayout(100, candidates, day("2026-06-10T18:00:00Z"))
    expect(res.matched).toBe(true)
    expect(res.chargeIds).toEqual(["c1"])
  })

  it("returns not-matched for an empty candidate list", () => {
    const res = matchStripePayout(100, [], day("2026-06-12T00:00:00Z"))
    expect(res.matched).toBe(false)
    expect(res.chargeIds).toEqual([])
  })
})
