import { describe, it, expect } from "vitest"
import {
  calculateRepasse,
  buildRepasseFromInvoices,
  calculateRepasseSummary,
  resolveAttendingProfId,
  buildRepasseByAttendingProfessional,
  type InvoiceItemForRepasse,
  type RepasseInvoiceLine,
} from "./repasse"

const round2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Helper to build InvoiceItemForRepasse with defaults
// ---------------------------------------------------------------------------
function makeItem(overrides: Partial<InvoiceItemForRepasse> = {}): InvoiceItemForRepasse {
  return {
    total: 100,
    attendingProfessionalId: null,
    invoiceProfessionalId: "prof-1",
    patientName: "Patient A",
    invoiceId: "inv-1",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// resolveAttendingProfId
// ---------------------------------------------------------------------------
describe("resolveAttendingProfId", () => {
  it("returns attendingProfessionalId when set", () => {
    const item = makeItem({ attendingProfessionalId: "sub-1", invoiceProfessionalId: "prof-1" })
    expect(resolveAttendingProfId(item)).toBe("sub-1")
  })

  it("falls back to invoiceProfessionalId when attendingProfessionalId is null", () => {
    const item = makeItem({ attendingProfessionalId: null, invoiceProfessionalId: "prof-1" })
    expect(resolveAttendingProfId(item)).toBe("prof-1")
  })
})

// ---------------------------------------------------------------------------
// calculateRepasse
// ---------------------------------------------------------------------------
describe("calculateRepasse", () => {
  it("calculates tax, afterTax, and repasse correctly", () => {
    const result = calculateRepasse(1000, 10, 50)
    expect(result).toEqual({
      grossValue: 1000,
      taxAmount: 100,
      afterTax: 900,
      repasseValue: 450,
    })
  })

  it("handles zero tax", () => {
    const result = calculateRepasse(200, 0, 60)
    expect(result).toEqual({
      grossValue: 200,
      taxAmount: 0,
      afterTax: 200,
      repasseValue: 120,
    })
  })

  it("handles zero repasse percent", () => {
    const result = calculateRepasse(500, 10, 0)
    expect(result).toEqual({
      grossValue: 500,
      taxAmount: 50,
      afterTax: 450,
      repasseValue: 0,
    })
  })

  it("handles zero gross value", () => {
    const result = calculateRepasse(0, 10, 50)
    expect(result).toEqual({
      grossValue: 0,
      taxAmount: 0,
      afterTax: 0,
      repasseValue: 0,
    })
  })

  it("rounds to 2 decimal places", () => {
    // 333 * 0.07 = 23.31, afterTax = 309.69, repasse = 309.69 * 0.33 = 102.1977 -> 102.20
    const result = calculateRepasse(333, 7, 33)
    expect(result.taxAmount).toBe(round2(333 * 0.07))
    expect(result.afterTax).toBe(round2(333 - result.taxAmount))
    expect(result.repasseValue).toBe(round2(result.afterTax * 0.33))
  })

  it("handles 100% tax", () => {
    const result = calculateRepasse(500, 100, 50)
    expect(result).toEqual({
      grossValue: 500,
      taxAmount: 500,
      afterTax: 0,
      repasseValue: 0,
    })
  })

  it("handles 100% repasse", () => {
    const result = calculateRepasse(400, 10, 100)
    expect(result).toEqual({
      grossValue: 400,
      taxAmount: 40,
      afterTax: 360,
      repasseValue: 360,
    })
  })
})

// ---------------------------------------------------------------------------
// buildRepasseFromInvoices
// ---------------------------------------------------------------------------
describe("buildRepasseFromInvoices", () => {
  it("maps invoices to repasse lines", () => {
    const invoices = [
      { invoiceId: "inv-1", patientName: "Ana", totalSessions: 4, totalAmount: 800 },
      { invoiceId: "inv-2", patientName: "Bruno", totalSessions: 2, totalAmount: 400 },
    ]
    const lines = buildRepasseFromInvoices(invoices, 10, 50)

    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      invoiceId: "inv-1",
      patientName: "Ana",
      totalSessions: 4,
      grossValue: 800,
      taxAmount: 80,
      afterTax: 720,
      repasseValue: 360,
    })
    expect(lines[1]).toEqual({
      invoiceId: "inv-2",
      patientName: "Bruno",
      totalSessions: 2,
      grossValue: 400,
      taxAmount: 40,
      afterTax: 360,
      repasseValue: 180,
    })
  })

  it("returns empty array for empty invoices", () => {
    expect(buildRepasseFromInvoices([], 10, 50)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// calculateRepasseSummary
// ---------------------------------------------------------------------------
describe("calculateRepasseSummary", () => {
  it("sums up all lines correctly", () => {
    const lines: RepasseInvoiceLine[] = [
      { invoiceId: "a", patientName: "A", totalSessions: 3, grossValue: 600, taxAmount: 60, afterTax: 540, repasseValue: 270 },
      { invoiceId: "b", patientName: "B", totalSessions: 2, grossValue: 400, taxAmount: 40, afterTax: 360, repasseValue: 180 },
    ]
    const summary = calculateRepasseSummary(lines)
    expect(summary).toEqual({
      totalInvoices: 2,
      totalSessions: 5,
      totalGross: 1000,
      totalTax: 100,
      totalAfterTax: 900,
      totalRepasse: 450,
    })
  })

  it("returns zeros for empty lines", () => {
    const summary = calculateRepasseSummary([])
    expect(summary).toEqual({
      totalInvoices: 0,
      totalSessions: 0,
      totalGross: 0,
      totalTax: 0,
      totalAfterTax: 0,
      totalRepasse: 0,
    })
  })

  it("rounds accumulated totals to 2 decimal places", () => {
    const lines: RepasseInvoiceLine[] = [
      { invoiceId: "a", patientName: "A", totalSessions: 1, grossValue: 33.33, taxAmount: 3.33, afterTax: 30, repasseValue: 15.01 },
      { invoiceId: "b", patientName: "B", totalSessions: 1, grossValue: 33.33, taxAmount: 3.33, afterTax: 30, repasseValue: 15.01 },
      { invoiceId: "c", patientName: "C", totalSessions: 1, grossValue: 33.34, taxAmount: 3.34, afterTax: 30, repasseValue: 15.01 },
    ]
    const summary = calculateRepasseSummary(lines)
    expect(summary.totalGross).toBe(100)
    expect(summary.totalTax).toBe(10)
    expect(summary.totalRepasse).toBe(45.03)
  })
})

// ---------------------------------------------------------------------------
// buildRepasseByAttendingProfessional
// ---------------------------------------------------------------------------
describe("buildRepasseByAttendingProfessional", () => {
  const taxPercent = 10

  describe("all items with no substitute (attendingProfessionalId null)", () => {
    it("routes all repasse to the invoice professional", () => {
      const items = [
        makeItem({ total: 200, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1", patientName: "Ana" }),
        makeItem({ total: 300, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-2", patientName: "Bruno" }),
      ]
      const professionals = new Map([["prof-1", { repassePercent: 50 }]])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      expect(result.size).toBe(1)
      const profResult = result.get("prof-1")!
      expect(profResult.lines).toHaveLength(2)
      expect(profResult.summary.totalGross).toBe(500)
      expect(profResult.summary.totalRepasse).toBe(225) // (500 - 50) * 0.5 = 225
    })
  })

  describe("some items with substitute", () => {
    it("splits repasse between original and substitute professionals", () => {
      const items = [
        makeItem({ total: 200, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1", patientName: "Ana" }),
        makeItem({ total: 300, invoiceProfessionalId: "prof-1", attendingProfessionalId: "sub-1", invoiceId: "inv-2", patientName: "Bruno" }),
      ]
      const professionals = new Map([
        ["prof-1", { repassePercent: 50 }],
        ["sub-1", { repassePercent: 60 }],
      ])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      expect(result.size).toBe(2)

      // prof-1 only gets the item without a substitute
      const prof1 = result.get("prof-1")!
      expect(prof1.lines).toHaveLength(1)
      expect(prof1.lines[0].grossValue).toBe(200)
      expect(prof1.lines[0].repasseValue).toBe(round2((200 - 20) * 0.5)) // 90

      // sub-1 gets the substituted item
      const sub1 = result.get("sub-1")!
      expect(sub1.lines).toHaveLength(1)
      expect(sub1.lines[0].grossValue).toBe(300)
      expect(sub1.lines[0].repasseValue).toBe(round2((300 - 30) * 0.6)) // 162
    })
  })

  describe("all items with same substitute", () => {
    it("routes 100% of repasse to the substitute", () => {
      const items = [
        makeItem({ total: 100, invoiceProfessionalId: "prof-1", attendingProfessionalId: "sub-1", invoiceId: "inv-1", patientName: "Ana" }),
        makeItem({ total: 200, invoiceProfessionalId: "prof-1", attendingProfessionalId: "sub-1", invoiceId: "inv-2", patientName: "Bruno" }),
      ]
      const professionals = new Map([
        ["prof-1", { repassePercent: 50 }],
        ["sub-1", { repassePercent: 70 }],
      ])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      // prof-1 should NOT appear at all -- no items resolved to them
      expect(result.has("prof-1")).toBe(false)

      const sub1 = result.get("sub-1")!
      expect(sub1.lines).toHaveLength(2)
      expect(sub1.summary.totalGross).toBe(300)
      // (100 - 10) * 0.7 + (200 - 20) * 0.7 = 63 + 126 = 189
      expect(sub1.summary.totalRepasse).toBe(189)
    })
  })

  describe("multiple professionals map entries", () => {
    it("handles items across multiple original professionals", () => {
      const items = [
        makeItem({ total: 400, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1", patientName: "Ana" }),
        makeItem({ total: 600, invoiceProfessionalId: "prof-2", attendingProfessionalId: null, invoiceId: "inv-2", patientName: "Bruno" }),
      ]
      const professionals = new Map([
        ["prof-1", { repassePercent: 40 }],
        ["prof-2", { repassePercent: 60 }],
      ])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      expect(result.size).toBe(2)

      const prof1 = result.get("prof-1")!
      expect(prof1.summary.totalGross).toBe(400)
      expect(prof1.summary.totalRepasse).toBe(round2((400 - 40) * 0.4)) // 144

      const prof2 = result.get("prof-2")!
      expect(prof2.summary.totalGross).toBe(600)
      expect(prof2.summary.totalRepasse).toBe(round2((600 - 60) * 0.6)) // 324
    })
  })

  describe("professional not in map is skipped", () => {
    it("skips items whose resolved professional is missing from the map", () => {
      const items = [
        makeItem({ total: 100, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1" }),
        makeItem({ total: 200, invoiceProfessionalId: "unknown-prof", attendingProfessionalId: null, invoiceId: "inv-2" }),
      ]
      const professionals = new Map([["prof-1", { repassePercent: 50 }]])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      expect(result.size).toBe(1)
      expect(result.has("prof-1")).toBe(true)
      expect(result.has("unknown-prof")).toBe(false)
    })

    it("skips substitute professional not in map", () => {
      const items = [
        makeItem({ total: 100, invoiceProfessionalId: "prof-1", attendingProfessionalId: "unknown-sub", invoiceId: "inv-1" }),
      ]
      const professionals = new Map([["prof-1", { repassePercent: 50 }]])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      // Resolved to unknown-sub which is not in the map -> skipped entirely
      expect(result.size).toBe(0)
    })
  })

  describe("items from same invoice grouped together", () => {
    it("merges items with same invoiceId into a single line", () => {
      const items = [
        makeItem({ total: 100, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1", patientName: "Ana" }),
        makeItem({ total: 150, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1", patientName: "Ana" }),
        makeItem({ total: 200, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-2", patientName: "Bruno" }),
      ]
      const professionals = new Map([["prof-1", { repassePercent: 50 }]])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      const prof1 = result.get("prof-1")!
      expect(prof1.lines).toHaveLength(2)

      const inv1Line = prof1.lines.find(l => l.invoiceId === "inv-1")!
      expect(inv1Line.grossValue).toBe(250) // 100 + 150 merged
      expect(inv1Line.totalSessions).toBe(2)
      expect(inv1Line.patientName).toBe("Ana")
      expect(inv1Line.repasseValue).toBe(round2((250 - 25) * 0.5)) // 112.5

      const inv2Line = prof1.lines.find(l => l.invoiceId === "inv-2")!
      expect(inv2Line.grossValue).toBe(200)
      expect(inv2Line.totalSessions).toBe(1)
    })

    it("groups items by invoice per professional independently", () => {
      // Same invoiceId but different attending professionals -> separate lines per prof
      const items = [
        makeItem({ total: 100, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1", patientName: "Ana" }),
        makeItem({ total: 200, invoiceProfessionalId: "prof-1", attendingProfessionalId: "sub-1", invoiceId: "inv-1", patientName: "Ana" }),
      ]
      const professionals = new Map([
        ["prof-1", { repassePercent: 50 }],
        ["sub-1", { repassePercent: 60 }],
      ])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      expect(result.size).toBe(2)

      const prof1 = result.get("prof-1")!
      expect(prof1.lines).toHaveLength(1)
      expect(prof1.lines[0].grossValue).toBe(100)

      const sub1 = result.get("sub-1")!
      expect(sub1.lines).toHaveLength(1)
      expect(sub1.lines[0].grossValue).toBe(200)
    })
  })

  describe("edge cases", () => {
    it("returns empty map for empty items list", () => {
      const professionals = new Map([["prof-1", { repassePercent: 50 }]])
      const result = buildRepasseByAttendingProfessional([], professionals, taxPercent)
      expect(result.size).toBe(0)
    })

    it("handles zero amounts", () => {
      const items = [
        makeItem({ total: 0, invoiceProfessionalId: "prof-1", attendingProfessionalId: null, invoiceId: "inv-1" }),
      ]
      const professionals = new Map([["prof-1", { repassePercent: 50 }]])

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)

      const prof1 = result.get("prof-1")!
      expect(prof1.lines[0].grossValue).toBe(0)
      expect(prof1.lines[0].taxAmount).toBe(0)
      expect(prof1.lines[0].afterTax).toBe(0)
      expect(prof1.lines[0].repasseValue).toBe(0)
      expect(prof1.summary.totalRepasse).toBe(0)
    })

    it("returns empty map when professionals map is empty", () => {
      const items = [makeItem({ total: 100 })]
      const professionals = new Map<string, { repassePercent: number }>()

      const result = buildRepasseByAttendingProfessional(items, professionals, taxPercent)
      expect(result.size).toBe(0)
    })
  })
})
