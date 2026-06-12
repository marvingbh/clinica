import { describe, it, expect } from "vitest"
import { buildCheckoutSessionParams, SESSION_MAX_DURATION_SECONDS } from "./checkout-params"

const base = {
  chargeId: "charge_1",
  invoiceId: "inv_1",
  clinicId: "clinic_1",
  description: "Fatura 06/2026 — Clínica X",
  amountCents: 30000,
  applicationFeeCents: 0,
  successUrl: "https://app/pagar/obrigado",
  cancelUrl: "https://app/api/public/pagar/charge_1?s=abc",
  nowSeconds: 1_000_000,
}

describe("buildCheckoutSessionParams", () => {
  it("uses BRL and card + pix", () => {
    const p = buildCheckoutSessionParams(base)
    expect(p.mode).toBe("payment")
    expect(p.payment_method_types).toEqual(["card", "pix"])
    expect(p.line_items?.[0].price_data?.currency).toBe("brl")
    expect(p.line_items?.[0].price_data?.unit_amount).toBe(30000)
  })

  it("duplicates metadata on session and payment_intent", () => {
    const p = buildCheckoutSessionParams(base)
    expect(p.metadata).toEqual({ chargeId: "charge_1", invoiceId: "inv_1", clinicId: "clinic_1" })
    expect(p.payment_intent_data?.metadata).toEqual(p.metadata)
  })

  it("omits application_fee_amount when 0", () => {
    const p = buildCheckoutSessionParams(base)
    expect(p.payment_intent_data?.application_fee_amount).toBeUndefined()
  })

  it("sets application_fee_amount when > 0", () => {
    const p = buildCheckoutSessionParams({ ...base, applicationFeeCents: 750 })
    expect(p.payment_intent_data?.application_fee_amount).toBe(750)
  })

  it("expires at most 24h out", () => {
    const p = buildCheckoutSessionParams(base)
    expect(p.expires_at).toBe(1_000_000 + SESSION_MAX_DURATION_SECONDS)
    expect(SESSION_MAX_DURATION_SECONDS).toBe(86400)
  })

  it("passes the customer email through", () => {
    const p = buildCheckoutSessionParams({ ...base, customerEmail: "x@y.com" })
    expect(p.customer_email).toBe("x@y.com")
  })
})
