import { describe, it, expect } from "vitest"
import { regimeAtDate, filterEventsByRegime, type ProfessionalRegimeInfo } from "./fiscal-period"
import type { PaymentEvent } from "./types"

function event(professionalProfileId: string, paymentDate: Date | null): PaymentEvent {
  return {
    paymentKey: `inv:${professionalProfileId}-${paymentDate?.toISOString() ?? "x"}`,
    invoiceId: "inv",
    reconciliationLinkId: null,
    paymentDate,
    amount: 100,
    patientId: "pat",
    professionalProfileId,
    refundedAmount: 0,
  }
}

describe("regimeAtDate", () => {
  it("returns the current regime when there is no switch date", () => {
    expect(regimeAtDate("PF", null, new Date("2025-06-01"))).toBe("PF")
    expect(regimeAtDate("PJ", null, new Date("2025-06-01"))).toBe("PJ")
  })

  it("returns the opposite regime for a payment before the switch", () => {
    expect(regimeAtDate("PJ", new Date("2025-07-01"), new Date("2025-06-30"))).toBe("PF")
  })

  it("returns the current regime for a payment on the switch date", () => {
    expect(regimeAtDate("PJ", new Date("2025-07-01"), new Date("2025-07-01"))).toBe("PJ")
  })

  it("returns the current regime for a payment after the switch", () => {
    expect(regimeAtDate("PJ", new Date("2025-07-01"), new Date("2025-08-15"))).toBe("PJ")
  })
})

describe("filterEventsByRegime", () => {
  const profs = new Map<string, ProfessionalRegimeInfo>([
    ["pf", { fiscalRegime: "PF", fiscalRegimeSince: null }],
    ["pj", { fiscalRegime: "PJ", fiscalRegimeSince: null }],
    ["switch", { fiscalRegime: "PJ", fiscalRegimeSince: new Date("2025-07-01") }],
    ["none", { fiscalRegime: null, fiscalRegimeSince: null }],
  ])

  it("keeps only PF events for the PF regime", () => {
    const events = [event("pf", new Date("2025-03-01")), event("pj", new Date("2025-03-01"))]
    const result = filterEventsByRegime(events, profs, "PF")
    expect(result).toHaveLength(1)
    expect(result[0].professionalProfileId).toBe("pf")
  })

  it("splits a mid-year switch professional across regimes", () => {
    const before = event("switch", new Date("2025-06-01")) // PF (before switch)
    const after = event("switch", new Date("2025-08-01")) // PJ (after switch)
    expect(filterEventsByRegime([before, after], profs, "PF")).toEqual([before])
    expect(filterEventsByRegime([before, after], profs, "PJ")).toEqual([after])
  })

  it("excludes professionals without a configured regime", () => {
    const events = [event("none", new Date("2025-03-01"))]
    expect(filterEventsByRegime(events, profs, "PF")).toHaveLength(0)
    expect(filterEventsByRegime(events, profs, "PJ")).toHaveLength(0)
  })

  it("evaluates null-dated events against the current regime", () => {
    const events = [event("switch", null)]
    expect(filterEventsByRegime(events, profs, "PJ")).toHaveLength(1)
    expect(filterEventsByRegime(events, profs, "PF")).toHaveLength(0)
  })
})
