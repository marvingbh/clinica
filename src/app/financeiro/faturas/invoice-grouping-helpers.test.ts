import { describe, it, expect } from "vitest"
import {
  buildInvoiceRows,
  filterRowsByStatus,
  countAllInvoices,
  sumTotalSessions,
  sumTotalAmount,
  collectAllInvoices,
  type Invoice,
} from "./invoice-grouping-helpers"

function makeInvoice(overrides: Partial<Invoice> & { id: string }): Invoice {
  return {
    referenceMonth: 3,
    referenceYear: 2026,
    invoiceType: "MONTHLY",
    status: "PENDENTE",
    totalSessions: 4,
    totalAmount: "400.00",
    dueDate: "2026-03-10",
    paidAt: null,
    notaFiscalEmitida: false,
    paidViaBank: false,
    bankPayerName: null,
    patient: { id: "p1", name: "Ana" },
    professionalProfile: { id: "prof1", user: { name: "Dr. Silva" } },
    _count: { items: 4 },
    ...overrides,
  }
}

describe("buildInvoiceRows", () => {
  it("renders MONTHLY and MANUAL invoices as individual rows", () => {
    const invoices = [
      makeInvoice({ id: "inv1", invoiceType: "MONTHLY" }),
      makeInvoice({ id: "inv2", invoiceType: "MANUAL" }),
    ]
    const rows = buildInvoiceRows(invoices)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe("individual")
    expect(rows[1].type).toBe("individual")
  })

  it("groups PER_SESSION invoices by patient+month+year", () => {
    const invoices = [
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", totalAmount: "100.00", totalSessions: 1, patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", totalAmount: "100.00", totalSessions: 1, patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s3", invoiceType: "PER_SESSION", totalAmount: "150.00", totalSessions: 1, patient: { id: "p2", name: "Bruno" } }),
    ]
    const rows = buildInvoiceRows(invoices)
    expect(rows).toHaveLength(2) // one group for Ana, one for Bruno
    expect(rows[0].type).toBe("group")
    if (rows[0].type === "group") {
      expect(rows[0].group.patientName).toBe("Ana")
      expect(rows[0].group.sessionCount).toBe(2)
      expect(rows[0].group.totalAmount).toBe(200)
      expect(rows[0].group.invoices).toHaveLength(2)
    }
    expect(rows[1].type).toBe("group")
    if (rows[1].type === "group") {
      expect(rows[1].group.patientName).toBe("Bruno")
      expect(rows[1].group.sessionCount).toBe(1)
    }
  })

  it("interleaves groups and individuals in original order", () => {
    const invoices = [
      makeInvoice({ id: "m1", invoiceType: "MONTHLY", patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", totalSessions: 1, patient: { id: "p2", name: "Bruno" } }),
      makeInvoice({ id: "m2", invoiceType: "MONTHLY", patient: { id: "p3", name: "Carlos" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", totalSessions: 1, patient: { id: "p2", name: "Bruno" } }),
    ]
    const rows = buildInvoiceRows(invoices)
    expect(rows).toHaveLength(3)
    expect(rows[0].type).toBe("individual") // Ana (m1)
    expect(rows[1].type).toBe("group") // Bruno (s1, s2)
    expect(rows[2].type).toBe("individual") // Carlos (m2)
  })

  it("derives group status using deriveGroupStatus", () => {
    const invoices = [
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", status: "PAGO", patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", status: "PENDENTE", patient: { id: "p1", name: "Ana" } }),
    ]
    const rows = buildInvoiceRows(invoices)
    expect(rows).toHaveLength(1)
    if (rows[0].type === "group") {
      expect(rows[0].group.derivedStatus).toBe("PARCIAL")
    }
  })
})

describe("filterRowsByStatus", () => {
  it("returns all rows when status is empty", () => {
    const rows = buildInvoiceRows([
      makeInvoice({ id: "m1", invoiceType: "MONTHLY", status: "PAGO" }),
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", status: "PENDENTE", patient: { id: "p1", name: "Ana" } }),
    ])
    expect(filterRowsByStatus(rows, "")).toHaveLength(2)
  })

  it("filters individual rows by invoice status", () => {
    const rows = buildInvoiceRows([
      makeInvoice({ id: "m1", invoiceType: "MONTHLY", status: "PAGO" }),
      makeInvoice({ id: "m2", invoiceType: "MONTHLY", status: "PENDENTE" }),
    ])
    const filtered = filterRowsByStatus(rows, "PAGO")
    expect(filtered).toHaveLength(1)
    if (filtered[0].type === "individual") {
      expect(filtered[0].invoice.id).toBe("m1")
    }
  })

  it("filters group rows by derived status", () => {
    const rows = buildInvoiceRows([
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", status: "PAGO", patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", status: "PENDENTE", patient: { id: "p1", name: "Ana" } }),
    ])
    // Derived status is PARCIAL
    expect(filterRowsByStatus(rows, "PARCIAL")).toHaveLength(1)
    expect(filterRowsByStatus(rows, "PAGO")).toHaveLength(0)
  })
})

describe("countAllInvoices", () => {
  it("counts individual invoices and group children", () => {
    const rows = buildInvoiceRows([
      makeInvoice({ id: "m1", invoiceType: "MONTHLY" }),
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", patient: { id: "p1", name: "Ana" } }),
    ])
    expect(countAllInvoices(rows)).toBe(3)
  })
})

describe("sumTotalSessions", () => {
  it("sums sessions across individuals and groups", () => {
    const rows = buildInvoiceRows([
      makeInvoice({ id: "m1", invoiceType: "MONTHLY", totalSessions: 4 }),
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", totalSessions: 1, patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", totalSessions: 1, patient: { id: "p1", name: "Ana" } }),
    ])
    expect(sumTotalSessions(rows)).toBe(6)
  })
})

describe("sumTotalAmount", () => {
  it("sums amounts across individuals and groups", () => {
    const rows = buildInvoiceRows([
      makeInvoice({ id: "m1", invoiceType: "MONTHLY", totalAmount: "400.00" }),
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", totalAmount: "100.00", patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", totalAmount: "100.00", patient: { id: "p1", name: "Ana" } }),
    ])
    expect(sumTotalAmount(rows)).toBe(600)
  })
})

describe("collectAllInvoices", () => {
  it("collects all invoices including group children", () => {
    const invoices = [
      makeInvoice({ id: "m1", invoiceType: "MONTHLY" }),
      makeInvoice({ id: "s1", invoiceType: "PER_SESSION", patient: { id: "p1", name: "Ana" } }),
      makeInvoice({ id: "s2", invoiceType: "PER_SESSION", patient: { id: "p1", name: "Ana" } }),
    ]
    const rows = buildInvoiceRows(invoices)
    const all = collectAllInvoices(rows)
    expect(all).toHaveLength(3)
    expect(all.map(i => i.id).sort()).toEqual(["m1", "s1", "s2"])
  })
})
