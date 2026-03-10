import { describe, it, expect } from "vitest"
import { computeInvoiceStatus, computeSmartDefault } from "./reconciliation"

describe("computeInvoiceStatus", () => {
  it("returns PENDENTE when paidAmount is 0", () => {
    expect(computeInvoiceStatus(0, 1000)).toBe("PENDENTE")
  })

  it("returns PARCIAL when 0 < paidAmount < totalAmount", () => {
    expect(computeInvoiceStatus(500, 1000)).toBe("PARCIAL")
  })

  it("returns PAGO when paidAmount equals totalAmount", () => {
    expect(computeInvoiceStatus(1000, 1000)).toBe("PAGO")
  })

  it("returns PAGO when paidAmount exceeds totalAmount", () => {
    expect(computeInvoiceStatus(1050, 1000)).toBe("PAGO")
  })

  it("handles decimal precision", () => {
    expect(computeInvoiceStatus(99.99, 100)).toBe("PARCIAL")
    expect(computeInvoiceStatus(100.00, 100)).toBe("PAGO")
  })
})

describe("computeSmartDefault", () => {
  it("returns min of transaction remaining and invoice remaining", () => {
    expect(computeSmartDefault(500, 300)).toBe(300)
    expect(computeSmartDefault(300, 500)).toBe(300)
  })

  it("returns 0 when either is 0", () => {
    expect(computeSmartDefault(0, 500)).toBe(0)
    expect(computeSmartDefault(500, 0)).toBe(0)
  })

  it("handles equal values", () => {
    expect(computeSmartDefault(500, 500)).toBe(500)
  })
})
