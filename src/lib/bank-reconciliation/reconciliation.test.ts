import { describe, it, expect } from "vitest"
import { allocateGroupPayment, computeInvoiceStatus, computeSmartDefault } from "./reconciliation"

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

describe("allocateGroupPayment", () => {
  it("allocates each invoice its own remaining amount when pool is sufficient", () => {
    // Marilia Ribeiro's real case: R$2560 payment covering Arthur (R$1600) + Manuela (R$960)
    expect(
      allocateGroupPayment(
        [
          { invoiceId: "arthur", remainingAmount: 1600 },
          { invoiceId: "manuela", remainingAmount: 960 },
        ],
        2560
      )
    ).toEqual([
      { invoiceId: "arthur", amount: 1600 },
      { invoiceId: "manuela", amount: 960 },
    ])
  })

  it("fills in order and gives the shortfall to the last invoice when pool is smaller than group", () => {
    expect(
      allocateGroupPayment(
        [
          { invoiceId: "a", remainingAmount: 1000 },
          { invoiceId: "b", remainingAmount: 500 },
        ],
        1200
      )
    ).toEqual([
      { invoiceId: "a", amount: 1000 },
      { invoiceId: "b", amount: 200 },
    ])
  })

  it("stops allocating once the pool is exhausted", () => {
    expect(
      allocateGroupPayment(
        [
          { invoiceId: "a", remainingAmount: 1000 },
          { invoiceId: "b", remainingAmount: 500 },
          { invoiceId: "c", remainingAmount: 300 },
        ],
        1000
      )
    ).toEqual([
      { invoiceId: "a", amount: 1000 },
      { invoiceId: "b", amount: 0 },
      { invoiceId: "c", amount: 0 },
    ])
  })

  it("never allocates more than an invoice's remaining amount even if pool is larger", () => {
    expect(
      allocateGroupPayment(
        [
          { invoiceId: "a", remainingAmount: 100 },
          { invoiceId: "b", remainingAmount: 100 },
        ],
        500
      )
    ).toEqual([
      { invoiceId: "a", amount: 100 },
      { invoiceId: "b", amount: 100 },
    ])
  })

  it("rounds to cents", () => {
    expect(
      allocateGroupPayment(
        [{ invoiceId: "a", remainingAmount: 100.006 }],
        100.006
      )
    ).toEqual([{ invoiceId: "a", amount: 100.01 }])
  })

  it("treats negative pool as zero", () => {
    expect(
      allocateGroupPayment([{ invoiceId: "a", remainingAmount: 100 }], -5)
    ).toEqual([{ invoiceId: "a", amount: 0 }])
  })

  // Regression test for the Marilia Ribeiro production bug:
  // a single PIX of R$2560 covered two siblings' invoices of uneven amounts
  // (Arthur R$1600 + Manuela R$960). The previous "equal split" logic sent
  // R$1280 to each, which exceeded Manuela's R$960 total and was rejected by
  // the server with "Valor excede o total da fatura (máx: 960.00)".
  it("never produces an allocation that exceeds an invoice total (Marilia Ribeiro case)", () => {
    const invoices = [
      { invoiceId: "arthur", remainingAmount: 1600, totalAmount: 1600 },
      { invoiceId: "manuela", remainingAmount: 960, totalAmount: 960 },
    ]
    const allocations = allocateGroupPayment(
      invoices.map(({ invoiceId, remainingAmount }) => ({ invoiceId, remainingAmount })),
      2560
    )

    // Mirrors the server-side check in /api/financeiro/conciliacao/reconcile
    for (const link of allocations) {
      const inv = invoices.find((i) => i.invoiceId === link.invoiceId)!
      expect(link.amount).toBeLessThanOrEqual(inv.totalAmount + 0.01)
    }

    // And the payment is fully applied (no money left unallocated).
    const totalAllocated = allocations.reduce((s, l) => s + l.amount, 0)
    expect(totalAllocated).toBe(2560)
  })
})
