import { describe, it, expect } from "vitest"
import {
  startOfMonthBrasilia,
  creditEligibleForInvoiceMonth,
} from "./credit-eligibility"

describe("startOfMonthBrasilia", () => {
  it("returns first day of month at Brasília midnight (UTC-3)", () => {
    // Brasília midnight May 1 = 03:00 UTC May 1
    expect(startOfMonthBrasilia(2026, 5).toISOString()).toBe("2026-05-01T03:00:00.000Z")
  })

  it("handles January (month=1) correctly", () => {
    expect(startOfMonthBrasilia(2026, 1).toISOString()).toBe("2026-01-01T03:00:00.000Z")
  })

  it("handles December (month=12) correctly", () => {
    expect(startOfMonthBrasilia(2026, 12).toISOString()).toBe("2026-12-01T03:00:00.000Z")
  })
})

describe("creditEligibleForInvoiceMonth", () => {
  it("excludes credits in the same calendar month", () => {
    const filter = creditEligibleForInvoiceMonth(2026, 5)
    const boundary = (filter.originAppointment as { scheduledAt: { lt: Date } }).scheduledAt.lt
    // Boundary is May 1 00:00 Brasília = May 1 03:00 UTC.
    // An appointment cancelled on April 30 23:00 BRT = May 1 02:00 UTC is BEFORE boundary → eligible.
    expect(new Date("2026-05-01T02:00:00.000Z") < boundary).toBe(true)
    // An appointment scheduled May 1 09:00 BRT = May 1 12:00 UTC is AFTER boundary → not eligible.
    expect(new Date("2026-05-01T12:00:00.000Z") < boundary).toBe(false)
  })

  it("accepts credits from two months earlier", () => {
    const filter = creditEligibleForInvoiceMonth(2026, 5)
    const boundary = (filter.originAppointment as { scheduledAt: { lt: Date } }).scheduledAt.lt
    expect(new Date("2026-03-15T12:00:00.000Z") < boundary).toBe(true)
  })
})
