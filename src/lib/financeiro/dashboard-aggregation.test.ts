import { describe, it, expect } from "vitest"
import {
  applyDerivedGroupStatus,
  aggregateInvoiceTotals,
  groupByMonth,
  groupByProfessional,
  buildPaymentsByDay,
  InvoiceForDashboard,
  PaidInvoiceForDay,
} from "./dashboard-aggregation"

// --- Helpers ---

function makeInvoice(overrides: Partial<InvoiceForDashboard> = {}): InvoiceForDashboard {
  return {
    referenceMonth: 1,
    referenceYear: 2026,
    status: "PENDENTE",
    totalAmount: 100,
    totalSessions: 4,
    creditsApplied: 1,
    extrasAdded: 0,
    invoiceType: "MONTHLY_FIXED",
    professionalProfileId: "prof-1",
    patientId: "patient-1",
    professionalProfile: { user: { name: "Dr. Ana" } },
    ...overrides,
  }
}

// ==========================================================================
// applyDerivedGroupStatus
// ==========================================================================

describe("applyDerivedGroupStatus", () => {
  const mockDeriveGroupStatus = (statuses: string[]) => {
    const hasPago = statuses.includes("PAGO")
    const hasUnpaid = statuses.some(s => s !== "PAGO")
    if (hasPago && hasUnpaid) return "PARCIAL"
    if (statuses.every(s => s === statuses[0])) return statuses[0]
    return "PARCIAL"
  }

  it("replaces PER_SESSION invoice statuses with derived group status", () => {
    const invoices = [
      makeInvoice({ invoiceType: "PER_SESSION", status: "PAGO", patientId: "p1", professionalProfileId: "prof-1", referenceMonth: 1, referenceYear: 2026 }),
      makeInvoice({ invoiceType: "PER_SESSION", status: "PENDENTE", patientId: "p1", professionalProfileId: "prof-1", referenceMonth: 1, referenceYear: 2026 }),
    ]

    const result = applyDerivedGroupStatus(invoices, mockDeriveGroupStatus)

    expect(result[0].status).toBe("PARCIAL")
    expect(result[1].status).toBe("PARCIAL")
  })

  it("does not modify MONTHLY_FIXED invoices", () => {
    const invoices = [
      makeInvoice({ invoiceType: "MONTHLY_FIXED", status: "PAGO" }),
      makeInvoice({ invoiceType: "MONTHLY_FIXED", status: "PENDENTE" }),
    ]

    const result = applyDerivedGroupStatus(invoices, mockDeriveGroupStatus)

    expect(result[0].status).toBe("PAGO")
    expect(result[1].status).toBe("PENDENTE")
  })

  it("groups PER_SESSION invoices by patient+prof+month+year key", () => {
    const invoices = [
      makeInvoice({ invoiceType: "PER_SESSION", status: "PAGO", patientId: "p1", referenceMonth: 1 }),
      makeInvoice({ invoiceType: "PER_SESSION", status: "PAGO", patientId: "p2", referenceMonth: 1 }),
    ]

    // Different patients => different groups => each stays PAGO
    const result = applyDerivedGroupStatus(invoices, mockDeriveGroupStatus)

    expect(result[0].status).toBe("PAGO")
    expect(result[1].status).toBe("PAGO")
  })

  it("handles empty invoice list", () => {
    const result = applyDerivedGroupStatus([], mockDeriveGroupStatus)
    expect(result).toEqual([])
  })

  it("handles mix of PER_SESSION and MONTHLY_FIXED", () => {
    const invoices = [
      makeInvoice({ invoiceType: "PER_SESSION", status: "PAGO", patientId: "p1" }),
      makeInvoice({ invoiceType: "MONTHLY_FIXED", status: "PENDENTE", patientId: "p1" }),
    ]

    const result = applyDerivedGroupStatus(invoices, mockDeriveGroupStatus)

    // PER_SESSION group has only PAGO => stays PAGO
    expect(result[0].status).toBe("PAGO")
    // MONTHLY_FIXED untouched
    expect(result[1].status).toBe("PENDENTE")
  })
})

// ==========================================================================
// aggregateInvoiceTotals
// ==========================================================================

describe("aggregateInvoiceTotals", () => {
  it("returns all zeros for empty invoice list", () => {
    const totals = aggregateInvoiceTotals([])

    expect(totals.totalFaturado).toBe(0)
    expect(totals.totalPendente).toBe(0)
    expect(totals.totalEnviado).toBe(0)
    expect(totals.totalParcial).toBe(0)
    expect(totals.totalPago).toBe(0)
    expect(totals.totalSessions).toBe(0)
    expect(totals.totalCredits).toBe(0)
    expect(totals.totalExtras).toBe(0)
    expect(totals.invoiceCount).toBe(0)
    expect(totals.pendingCount).toBe(0)
    expect(totals.enviadoCount).toBe(0)
    expect(totals.parcialCount).toBe(0)
    expect(totals.paidCount).toBe(0)
  })

  it("sums totalFaturado from all invoices regardless of status", () => {
    const invoices = [
      makeInvoice({ totalAmount: 100, status: "PAGO" }),
      makeInvoice({ totalAmount: 200, status: "PENDENTE" }),
      makeInvoice({ totalAmount: 300, status: "ENVIADO" }),
    ]

    const totals = aggregateInvoiceTotals(invoices)

    expect(totals.totalFaturado).toBe(600)
  })

  it("counts and sums by status correctly", () => {
    const invoices = [
      makeInvoice({ totalAmount: 100, status: "PENDENTE" }),
      makeInvoice({ totalAmount: 200, status: "PENDENTE" }),
      makeInvoice({ totalAmount: 150, status: "ENVIADO" }),
      makeInvoice({ totalAmount: 50, status: "PARCIAL" }),
      makeInvoice({ totalAmount: 300, status: "PAGO" }),
      makeInvoice({ totalAmount: 100, status: "PAGO" }),
    ]

    const totals = aggregateInvoiceTotals(invoices)

    expect(totals.pendingCount).toBe(2)
    expect(totals.totalPendente).toBe(300)
    expect(totals.enviadoCount).toBe(1)
    expect(totals.totalEnviado).toBe(150)
    expect(totals.parcialCount).toBe(1)
    expect(totals.totalParcial).toBe(50)
    expect(totals.paidCount).toBe(2)
    expect(totals.totalPago).toBe(400)
    expect(totals.invoiceCount).toBe(6)
  })

  it("sums sessions, credits, and extras", () => {
    const invoices = [
      makeInvoice({ totalSessions: 4, creditsApplied: 1, extrasAdded: 2 }),
      makeInvoice({ totalSessions: 8, creditsApplied: 3, extrasAdded: 0 }),
      makeInvoice({ totalSessions: 2, creditsApplied: 0, extrasAdded: 1 }),
    ]

    const totals = aggregateInvoiceTotals(invoices)

    expect(totals.totalSessions).toBe(14)
    expect(totals.totalCredits).toBe(4)
    expect(totals.totalExtras).toBe(3)
  })

  it("coerces Decimal-like totalAmount via Number()", () => {
    const decimalLike = {
      toString: () => "350.50",
      valueOf: () => 350.5,
      [Symbol.toPrimitive]: () => 350.5,
    }
    const invoices = [makeInvoice({ totalAmount: decimalLike, status: "PAGO" })]

    const totals = aggregateInvoiceTotals(invoices)

    expect(totals.totalFaturado).toBe(350.5)
    expect(totals.totalPago).toBe(350.5)
  })

  it("does not count CANCELADO status in any bucket", () => {
    const invoices = [
      makeInvoice({ totalAmount: 500, status: "CANCELADO" }),
    ]

    const totals = aggregateInvoiceTotals(invoices)

    expect(totals.totalFaturado).toBe(500) // still counted in faturado
    expect(totals.invoiceCount).toBe(1)
    expect(totals.pendingCount).toBe(0)
    expect(totals.enviadoCount).toBe(0)
    expect(totals.parcialCount).toBe(0)
    expect(totals.paidCount).toBe(0)
  })
})

// ==========================================================================
// groupByMonth
// ==========================================================================

describe("groupByMonth", () => {
  it("returns empty object for no invoices", () => {
    expect(groupByMonth([])).toEqual({})
  })

  it("groups invoices by referenceMonth", () => {
    const invoices = [
      makeInvoice({ referenceMonth: 1, status: "PAGO", totalAmount: 100 }),
      makeInvoice({ referenceMonth: 1, status: "PENDENTE", totalAmount: 200 }),
      makeInvoice({ referenceMonth: 3, status: "ENVIADO", totalAmount: 150 }),
    ]

    const result = groupByMonth(invoices)

    expect(result[1].faturado).toBe(300)
    expect(result[1].pago).toBe(100)
    expect(result[1].pendente).toBe(200)
    expect(result[1].invoiceCount).toBe(2)
    expect(result[3].faturado).toBe(150)
    expect(result[3].enviado).toBe(150)
    expect(result[3].invoiceCount).toBe(1)
    expect(result[2]).toBeUndefined()
  })

  it("sums sessions, credits, and extras per month", () => {
    const invoices = [
      makeInvoice({ referenceMonth: 5, totalSessions: 4, creditsApplied: 1, extrasAdded: 2 }),
      makeInvoice({ referenceMonth: 5, totalSessions: 6, creditsApplied: 2, extrasAdded: 1 }),
    ]

    const result = groupByMonth(invoices)

    expect(result[5].sessions).toBe(10)
    expect(result[5].credits).toBe(3)
    expect(result[5].extras).toBe(3)
  })

  it("tracks status counts per month", () => {
    const invoices = [
      makeInvoice({ referenceMonth: 2, status: "PARCIAL", totalAmount: 50 }),
      makeInvoice({ referenceMonth: 2, status: "PARCIAL", totalAmount: 80 }),
      makeInvoice({ referenceMonth: 2, status: "PAGO", totalAmount: 100 }),
    ]

    const result = groupByMonth(invoices)

    expect(result[2].parcialCount).toBe(2)
    expect(result[2].parcial).toBe(130)
    expect(result[2].paidCount).toBe(1)
    expect(result[2].pago).toBe(100)
  })
})

// ==========================================================================
// groupByProfessional
// ==========================================================================

describe("groupByProfessional", () => {
  it("returns empty array for no invoices", () => {
    expect(groupByProfessional([])).toEqual([])
  })

  it("groups by professional with deduplicated patient count", () => {
    const invoices = [
      makeInvoice({ professionalProfileId: "prof-1", patientId: "p1", totalAmount: 100, status: "PAGO" }),
      makeInvoice({ professionalProfileId: "prof-1", patientId: "p1", totalAmount: 200, status: "PENDENTE" }),
      makeInvoice({ professionalProfileId: "prof-1", patientId: "p2", totalAmount: 50, status: "PAGO" }),
    ]

    const result = groupByProfessional(invoices)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("prof-1")
    expect(result[0].name).toBe("Dr. Ana")
    expect(result[0].patientCount).toBe(2)
    expect(result[0].faturado).toBe(350)
    expect(result[0].pago).toBe(150)
    expect(result[0].pendente).toBe(200)
    expect(result[0].invoiceCount).toBe(3)
  })

  it("sorts by faturado descending", () => {
    const invoices = [
      makeInvoice({ professionalProfileId: "prof-1", totalAmount: 100, professionalProfile: { user: { name: "Dr. Ana" } } }),
      makeInvoice({ professionalProfileId: "prof-2", totalAmount: 500, professionalProfile: { user: { name: "Dr. Bruno" } } }),
      makeInvoice({ professionalProfileId: "prof-3", totalAmount: 300, professionalProfile: { user: { name: "Dr. Carla" } } }),
    ]

    const result = groupByProfessional(invoices)

    expect(result[0].name).toBe("Dr. Bruno")
    expect(result[1].name).toBe("Dr. Carla")
    expect(result[2].name).toBe("Dr. Ana")
  })

  it("tracks status amounts per professional", () => {
    const invoices = [
      makeInvoice({ professionalProfileId: "prof-1", totalAmount: 100, status: "ENVIADO" }),
      makeInvoice({ professionalProfileId: "prof-1", totalAmount: 200, status: "PARCIAL" }),
    ]

    const result = groupByProfessional(invoices)

    expect(result[0].enviado).toBe(100)
    expect(result[0].parcial).toBe(200)
  })

  it("sums sessions per professional", () => {
    const invoices = [
      makeInvoice({ professionalProfileId: "prof-1", totalSessions: 4 }),
      makeInvoice({ professionalProfileId: "prof-1", totalSessions: 6 }),
    ]

    const result = groupByProfessional(invoices)

    expect(result[0].sessions).toBe(10)
  })
})

// ==========================================================================
// buildPaymentsByDay
// ==========================================================================

describe("buildPaymentsByDay", () => {
  it("returns array of correct length with all zeros when no payments", () => {
    const result = buildPaymentsByDay([], 31)

    expect(result).toHaveLength(31)
    expect(result[0]).toEqual({ day: 1, amount: 0, count: 0, cumulative: 0 })
    expect(result[30]).toEqual({ day: 31, amount: 0, count: 0, cumulative: 0 })
  })

  it("groups payments by day and builds cumulative totals", () => {
    const paid: PaidInvoiceForDay[] = [
      { paidAt: new Date(2026, 0, 5), totalAmount: 200 },
      { paidAt: new Date(2026, 0, 5), totalAmount: 100 },
      { paidAt: new Date(2026, 0, 10), totalAmount: 300 },
    ]

    const result = buildPaymentsByDay(paid, 31)

    expect(result[4]).toEqual({ day: 5, amount: 300, count: 2, cumulative: 300 })
    expect(result[9]).toEqual({ day: 10, amount: 300, count: 1, cumulative: 600 })
    expect(result[0]).toEqual({ day: 1, amount: 0, count: 0, cumulative: 0 })
  })

  it("accumulates cumulative totals across days correctly", () => {
    const paid: PaidInvoiceForDay[] = [
      { paidAt: new Date(2026, 1, 1), totalAmount: 100 },
      { paidAt: new Date(2026, 1, 3), totalAmount: 200 },
      { paidAt: new Date(2026, 1, 3), totalAmount: 50 },
    ]

    const result = buildPaymentsByDay(paid, 28)

    expect(result).toHaveLength(28)
    expect(result[0].cumulative).toBe(100) // day 1
    expect(result[1].cumulative).toBe(100) // day 2 (no payment)
    expect(result[2].cumulative).toBe(350) // day 3 (100+200+50)
    expect(result[27].cumulative).toBe(350) // last day
  })

  it("skips invoices with null paidAt", () => {
    const paid: PaidInvoiceForDay[] = [
      { paidAt: null, totalAmount: 999 },
      { paidAt: new Date(2026, 0, 15), totalAmount: 100 },
    ]

    const result = buildPaymentsByDay(paid, 31)

    const totalAmount = result.reduce((sum, d) => sum + d.amount, 0)
    expect(totalAmount).toBe(100)
  })

  it("handles single day in month", () => {
    const paid: PaidInvoiceForDay[] = [
      { paidAt: new Date(2026, 0, 1), totalAmount: 50 },
    ]

    const result = buildPaymentsByDay(paid, 1)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ day: 1, amount: 50, count: 1, cumulative: 50 })
  })

  it("coerces Decimal-like totalAmount via Number()", () => {
    const decimalLike = { valueOf: () => 250.75, [Symbol.toPrimitive]: () => 250.75 }
    const paid: PaidInvoiceForDay[] = [
      { paidAt: new Date(2026, 0, 1), totalAmount: decimalLike },
    ]

    const result = buildPaymentsByDay(paid, 1)

    expect(result[0].amount).toBe(250.75)
  })
})
