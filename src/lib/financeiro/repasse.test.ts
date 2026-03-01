import { describe, it, expect } from "vitest"
import {
  REPASSE_BILLABLE_INVOICE_STATUSES,
  calculateRepasse,
  buildRepasseFromInvoices,
  calculateRepasseSummary,
  type InvoiceForRepasse,
  type RepasseInvoiceLine,
} from "./repasse"

// --- REPASSE_BILLABLE_INVOICE_STATUSES ---

describe("REPASSE_BILLABLE_INVOICE_STATUSES", () => {
  it("includes PENDENTE, ENVIADO, PAGO", () => {
    expect(REPASSE_BILLABLE_INVOICE_STATUSES).toEqual(
      expect.arrayContaining(["PENDENTE", "ENVIADO", "PAGO"])
    )
    expect(REPASSE_BILLABLE_INVOICE_STATUSES).toHaveLength(3)
  })

  it("excludes CANCELADO", () => {
    expect(REPASSE_BILLABLE_INVOICE_STATUSES).not.toContain("CANCELADO")
  })
})

// --- calculateRepasse ---

describe("calculateRepasse", () => {
  it("calculates tax and repasse correctly (R$200, 10% tax, 40% repasse)", () => {
    const result = calculateRepasse(200, 10, 40)
    expect(result.grossValue).toBe(200)
    expect(result.taxAmount).toBe(20)
    expect(result.afterTax).toBe(180)
    expect(result.repasseValue).toBe(72)
  })

  it("handles zero tax", () => {
    const result = calculateRepasse(200, 0, 40)
    expect(result.taxAmount).toBe(0)
    expect(result.afterTax).toBe(200)
    expect(result.repasseValue).toBe(80)
  })

  it("handles zero repasse percent", () => {
    const result = calculateRepasse(200, 10, 0)
    expect(result.taxAmount).toBe(20)
    expect(result.afterTax).toBe(180)
    expect(result.repasseValue).toBe(0)
  })

  it("rounds to 2 decimal places (R$100, 7% tax, 33% repasse)", () => {
    const result = calculateRepasse(100, 7, 33)
    expect(result.taxAmount).toBe(7)
    expect(result.afterTax).toBe(93)
    expect(result.repasseValue).toBe(30.69)
  })

  it("handles negative totalAmount (credit invoices)", () => {
    const result = calculateRepasse(-50, 10, 40)
    expect(result.grossValue).toBe(-50)
    expect(result.taxAmount).toBe(-5)
    expect(result.afterTax).toBe(-45)
    expect(result.repasseValue).toBe(-18)
  })
})

// --- buildRepasseFromInvoices ---

describe("buildRepasseFromInvoices", () => {
  const taxPercent = 10
  const repassePercent = 40

  const makeInvoice = (overrides: Partial<InvoiceForRepasse> = {}): InvoiceForRepasse => ({
    invoiceId: "inv-1",
    patientName: "Maria Silva",
    totalSessions: 4,
    totalAmount: 800,
    ...overrides,
  })

  it("builds line items from invoices with correct repasse calculation", () => {
    const invoices = [makeInvoice({ totalAmount: 800, totalSessions: 4 })]
    const lines = buildRepasseFromInvoices(invoices, taxPercent, repassePercent)

    expect(lines).toHaveLength(1)
    expect(lines[0].invoiceId).toBe("inv-1")
    expect(lines[0].patientName).toBe("Maria Silva")
    expect(lines[0].totalSessions).toBe(4)
    expect(lines[0].grossValue).toBe(800)
    expect(lines[0].taxAmount).toBe(80)
    expect(lines[0].afterTax).toBe(720)
    expect(lines[0].repasseValue).toBe(288)
  })

  it("handles multiple invoices", () => {
    const invoices = [
      makeInvoice({ invoiceId: "inv-1", patientName: "Maria", totalAmount: 600, totalSessions: 3 }),
      makeInvoice({ invoiceId: "inv-2", patientName: "João", totalAmount: 400, totalSessions: 2 }),
    ]
    const lines = buildRepasseFromInvoices(invoices, taxPercent, repassePercent)

    expect(lines).toHaveLength(2)
    expect(lines[0].grossValue).toBe(600)
    expect(lines[1].grossValue).toBe(400)
  })

  it("handles empty invoices list", () => {
    const lines = buildRepasseFromInvoices([], taxPercent, repassePercent)
    expect(lines).toHaveLength(0)
  })

  it("handles invoice with zero totalAmount", () => {
    const invoices = [makeInvoice({ totalAmount: 0, totalSessions: 0 })]
    const lines = buildRepasseFromInvoices(invoices, taxPercent, repassePercent)

    expect(lines).toHaveLength(1)
    expect(lines[0].grossValue).toBe(0)
    expect(lines[0].repasseValue).toBe(0)
  })
})

// --- calculateRepasseSummary ---

describe("calculateRepasseSummary", () => {
  const makeLine = (overrides: Partial<RepasseInvoiceLine> = {}): RepasseInvoiceLine => ({
    invoiceId: "inv-1",
    patientName: "Maria",
    totalSessions: 4,
    grossValue: 800,
    taxAmount: 80,
    afterTax: 720,
    repasseValue: 288,
    ...overrides,
  })

  it("aggregates totals correctly", () => {
    const lines: RepasseInvoiceLine[] = [
      makeLine({ invoiceId: "inv-1", totalSessions: 4, grossValue: 800, taxAmount: 80, afterTax: 720, repasseValue: 288 }),
      makeLine({ invoiceId: "inv-2", totalSessions: 2, grossValue: 400, taxAmount: 40, afterTax: 360, repasseValue: 144 }),
      makeLine({ invoiceId: "inv-3", totalSessions: 1, grossValue: 200, taxAmount: 20, afterTax: 180, repasseValue: 72 }),
    ]

    const summary = calculateRepasseSummary(lines)

    expect(summary.totalInvoices).toBe(3)
    expect(summary.totalSessions).toBe(7)
    expect(summary.totalGross).toBe(1400)
    expect(summary.totalTax).toBe(140)
    expect(summary.totalAfterTax).toBe(1260)
    expect(summary.totalRepasse).toBe(504)
  })

  it("returns zeros for empty items", () => {
    const summary = calculateRepasseSummary([])

    expect(summary.totalInvoices).toBe(0)
    expect(summary.totalSessions).toBe(0)
    expect(summary.totalGross).toBe(0)
    expect(summary.totalTax).toBe(0)
    expect(summary.totalAfterTax).toBe(0)
    expect(summary.totalRepasse).toBe(0)
  })

  it("rounds totals to 2 decimal places", () => {
    const lines: RepasseInvoiceLine[] = [
      makeLine({ grossValue: 100.33, taxAmount: 10.03, afterTax: 90.3, repasseValue: 36.12 }),
      makeLine({ invoiceId: "inv-2", grossValue: 100.33, taxAmount: 10.03, afterTax: 90.3, repasseValue: 36.12 }),
      makeLine({ invoiceId: "inv-3", grossValue: 100.34, taxAmount: 10.04, afterTax: 90.3, repasseValue: 36.12 }),
    ]

    const summary = calculateRepasseSummary(lines)

    expect(summary.totalGross).toBe(301)
    expect(summary.totalTax).toBe(30.1)
    expect(summary.totalAfterTax).toBe(270.9)
    expect(summary.totalRepasse).toBe(108.36)
  })
})
