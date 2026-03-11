import { describe, it, expect } from "vitest"
import { shouldCancelPerSessionInvoice } from "./per-session-cancellation"

describe("shouldCancelPerSessionInvoice", () => {
  it("returns true for PENDENTE", () => {
    expect(shouldCancelPerSessionInvoice("PENDENTE")).toBe(true)
  })

  it("returns true for ENVIADO", () => {
    expect(shouldCancelPerSessionInvoice("ENVIADO")).toBe(true)
  })

  it("returns false for PAGO", () => {
    expect(shouldCancelPerSessionInvoice("PAGO")).toBe(false)
  })

  it("returns false for PARCIAL", () => {
    expect(shouldCancelPerSessionInvoice("PARCIAL")).toBe(false)
  })

  it("returns false for CANCELADO", () => {
    expect(shouldCancelPerSessionInvoice("CANCELADO")).toBe(false)
  })
})
