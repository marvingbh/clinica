import { describe, it, expect } from "vitest"
import {
  calculateRepasse,
  calculateRepasseSummary,
  buildRepasseFromInvoices,
  computeInvoiceBreakdown,
  type InvoiceBreakdownInput,
  type RepasseInvoiceLine,
} from "./repasse"

const round2 = (n: number) => Math.round(n * 100) / 100

function makeInvoice(overrides: Partial<InvoiceBreakdownInput> = {}): InvoiceBreakdownInput {
  return {
    invoiceId: "inv-1",
    invoiceProfessionalId: "prof-1",
    patientName: "Patient A",
    invoiceTotalAmount: 400,
    invoiceTotalSessions: 1,
    items: [],
    creditOriginatingProfessionalIds: [],
    ...overrides,
  }
}

describe("calculateRepasse", () => {
  it("calculates tax, afterTax, and repasse correctly", () => {
    expect(calculateRepasse(1000, 10, 50)).toEqual({
      grossValue: 1000, taxAmount: 100, afterTax: 900, repasseValue: 450,
    })
  })
  it("handles zero tax", () => {
    expect(calculateRepasse(200, 0, 60)).toEqual({
      grossValue: 200, taxAmount: 0, afterTax: 200, repasseValue: 120,
    })
  })
  it("handles zero gross value", () => {
    expect(calculateRepasse(0, 10, 50)).toEqual({
      grossValue: 0, taxAmount: 0, afterTax: 0, repasseValue: 0,
    })
  })
  it("rounds to 2 decimal places", () => {
    const r = calculateRepasse(333, 7, 33)
    expect(r.taxAmount).toBe(round2(333 * 0.07))
    expect(r.afterTax).toBe(round2(333 - r.taxAmount))
    expect(r.repasseValue).toBe(round2(r.afterTax * 0.33))
  })
  it("handles 100% tax", () => {
    expect(calculateRepasse(500, 100, 50)).toEqual({
      grossValue: 500, taxAmount: 500, afterTax: 0, repasseValue: 0,
    })
  })
})

describe("computeInvoiceBreakdown", () => {
  it("single professional covering everything gets the whole invoice", () => {
    const result = computeInvoiceBreakdown(makeInvoice({
      invoiceTotalAmount: 1400,
      invoiceTotalSessions: 5,
      items: [
        { total: 280, isCredit: false, attendingProfessionalId: null },
        { total: 280, isCredit: false, attendingProfessionalId: null },
        { total: 280, isCredit: false, attendingProfessionalId: null },
        { total: 280, isCredit: false, attendingProfessionalId: null },
        { total: 280, isCredit: false, attendingProfessionalId: null },
      ],
    }))
    expect(result).toEqual([
      { professionalProfileId: "prof-1", grossValue: 1400, totalSessions: 5 },
    ])
  })

  it("splits by attending professional — Ana Cecília case (3 items to Livia, 1 to Elena)", () => {
    // Reference professional (invoice owner) is Elena; 3 items are attended by
    // Livia, 1 by Elena. Both must show up in repasse.
    const result = computeInvoiceBreakdown(makeInvoice({
      invoiceProfessionalId: "elena",
      invoiceTotalAmount: 2280,
      invoiceTotalSessions: 4,
      items: [
        { total: 570, isCredit: false, attendingProfessionalId: "livia" },
        { total: 570, isCredit: false, attendingProfessionalId: "livia" },
        { total: 570, isCredit: false, attendingProfessionalId: "livia" },
        { total: 570, isCredit: false, attendingProfessionalId: "elena" },
      ],
    }))

    const livia = result.find((e) => e.professionalProfileId === "livia")!
    const elena = result.find((e) => e.professionalProfileId === "elena")!
    expect(livia.grossValue).toBe(1710)
    expect(livia.totalSessions).toBe(3)
    expect(elena.grossValue).toBe(570)
    expect(elena.totalSessions).toBe(1)
    expect(livia.grossValue + elena.grossValue).toBe(2280)
  })

  it("items with attendingProfessionalId=null fall back to invoice owner", () => {
    const result = computeInvoiceBreakdown(makeInvoice({
      invoiceProfessionalId: "elena",
      invoiceTotalAmount: 2280,
      invoiceTotalSessions: 4,
      items: [
        { total: 570, isCredit: false, attendingProfessionalId: "livia" },
        { total: 570, isCredit: false, attendingProfessionalId: null }, // → elena
        { total: 570, isCredit: false, attendingProfessionalId: null }, // → elena
        { total: 570, isCredit: false, attendingProfessionalId: null }, // → elena
      ],
    }))

    expect(result.find((e) => e.professionalProfileId === "livia")!.grossValue).toBe(570)
    expect(result.find((e) => e.professionalProfileId === "elena")!.grossValue).toBe(1710)
  })

  it("attributes credits to the originating professional — Diogo case", () => {
    // Livia attended 4 items (R$1120), Elena attended 1 (R$280), and a credit
    // of -R$280 came from Livia's own cancelled session. Expected:
    // Livia: 1120 - 280 = 840, Elena: 280. Sum: 1120 = invoice.totalAmount.
    const result = computeInvoiceBreakdown(makeInvoice({
      invoiceProfessionalId: "livia",
      invoiceTotalAmount: 1120,
      invoiceTotalSessions: 5,
      items: [
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "elena" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: -280, isCredit: true, attendingProfessionalId: null },
      ],
      creditOriginatingProfessionalIds: ["livia"],
    }))

    const livia = result.find((e) => e.professionalProfileId === "livia")!
    const elena = result.find((e) => e.professionalProfileId === "elena")!
    expect(livia.grossValue).toBe(840)
    expect(elena.grossValue).toBe(280)
    expect(livia.grossValue + elena.grossValue).toBe(1120)
  })

  it("falls back to the invoice owner for credits when origin info is missing", () => {
    // Legacy / manual credits with no SessionCredit linkage go to invoice owner.
    const result = computeInvoiceBreakdown(makeInvoice({
      invoiceProfessionalId: "livia",
      invoiceTotalAmount: 840,
      invoiceTotalSessions: 4,
      items: [
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: -280, isCredit: true, attendingProfessionalId: null },
        { total: -280, isCredit: true, attendingProfessionalId: null },
      ],
      creditOriginatingProfessionalIds: [], // missing origin info for both credits
    }))
    expect(result).toEqual([
      { professionalProfileId: "livia", grossValue: 560, totalSessions: 4 },
    ])
  })

  it("credit from a different professional than the invoice owner is attributed to that professional", () => {
    // Edge: the credit's originating prof didn't attend any items on this invoice.
    const result = computeInvoiceBreakdown(makeInvoice({
      invoiceProfessionalId: "livia",
      invoiceTotalAmount: 560,
      invoiceTotalSessions: 3,
      items: [
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: 280, isCredit: false, attendingProfessionalId: "livia" },
        { total: -280, isCredit: true, attendingProfessionalId: null },
      ],
      creditOriginatingProfessionalIds: ["outsider"],
    }))
    const livia = result.find((e) => e.professionalProfileId === "livia")!
    const outsider = result.find((e) => e.professionalProfileId === "outsider")!
    expect(livia.grossValue).toBe(840)
    expect(outsider.grossValue).toBe(-280)
    expect(livia.grossValue + outsider.grossValue).toBe(560)
  })
})

describe("buildRepasseFromInvoices", () => {
  const taxPercent = 10

  it("produces lines per attending professional — Ana Cecília", () => {
    const invoices = [
      makeInvoice({
        invoiceProfessionalId: "elena",
        invoiceTotalAmount: 2280,
        invoiceTotalSessions: 4,
        items: [
          { total: 570, isCredit: false, attendingProfessionalId: "livia" },
          { total: 570, isCredit: false, attendingProfessionalId: "livia" },
          { total: 570, isCredit: false, attendingProfessionalId: "livia" },
          { total: 570, isCredit: false, attendingProfessionalId: "elena" },
        ],
      }),
    ]
    const profs = new Map([
      ["elena", { repassePercent: 60 }],
      ["livia", { repassePercent: 31 }],
    ])

    const result = buildRepasseFromInvoices(invoices, profs, taxPercent)
    expect(result.get("livia")!.lines[0].grossValue).toBe(1710)
    expect(result.get("elena")!.lines[0].grossValue).toBe(570)
  })

  it("Diogo — Livia's gross = 840 (invoice total minus her own credit)", () => {
    const invoices = [
      makeInvoice({
        invoiceId: "diogo-apr",
        invoiceProfessionalId: "livia",
        invoiceTotalAmount: 1120,
        invoiceTotalSessions: 5,
        items: [
          { total: 280, isCredit: false, attendingProfessionalId: "livia" },
          { total: 280, isCredit: false, attendingProfessionalId: "livia" },
          { total: 280, isCredit: false, attendingProfessionalId: "livia" },
          { total: 280, isCredit: false, attendingProfessionalId: "elena" },
          { total: 280, isCredit: false, attendingProfessionalId: "livia" },
          { total: -280, isCredit: true, attendingProfessionalId: null },
        ],
        creditOriginatingProfessionalIds: ["livia"],
      }),
    ]
    const profs = new Map([
      ["elena", { repassePercent: 60 }],
      ["livia", { repassePercent: 31 }],
    ])

    const result = buildRepasseFromInvoices(invoices, profs, taxPercent)
    expect(result.get("livia")!.lines[0].grossValue).toBe(840)
    expect(result.get("elena")!.lines[0].grossValue).toBe(280)
  })

  it("skips invoices whose professional is not in the professionals map", () => {
    const invoices = [
      makeInvoice({ invoiceId: "inv-1", invoiceProfessionalId: "prof-1", items: [
        { total: 400, isCredit: false, attendingProfessionalId: null },
      ]}),
      makeInvoice({ invoiceId: "inv-2", invoiceProfessionalId: "unknown", items: [
        { total: 400, isCredit: false, attendingProfessionalId: null },
      ]}),
    ]
    const profs = new Map([["prof-1", { repassePercent: 50 }]])

    const result = buildRepasseFromInvoices(invoices, profs, taxPercent)
    expect(result.has("prof-1")).toBe(true)
    expect(result.has("unknown")).toBe(false)
  })

  it("handles empty invoice list", () => {
    expect(buildRepasseFromInvoices([], new Map(), taxPercent).size).toBe(0)
  })

  describe("paidAmount / percentPaid", () => {
    it("splits reconciled cash proportionally to each professional's gross", () => {
      const invoices = [
        makeInvoice({
          invoiceProfessionalId: "elena",
          invoiceTotalAmount: 2280,
          items: [
            { total: 570, isCredit: false, attendingProfessionalId: "livia" },
            { total: 570, isCredit: false, attendingProfessionalId: "livia" },
            { total: 570, isCredit: false, attendingProfessionalId: "livia" },
            { total: 570, isCredit: false, attendingProfessionalId: "elena" },
          ],
        }),
      ]
      const profs = new Map([
        ["elena", { repassePercent: 50 }],
        ["livia", { repassePercent: 50 }],
      ])
      const paid = new Map([["inv-1", 2280]]) // fully reconciled

      const result = buildRepasseFromInvoices(invoices, profs, taxPercent, paid)
      expect(result.get("livia")!.lines[0].paidAmount).toBe(1710)
      expect(result.get("livia")!.lines[0].percentPaid).toBe(100)
      expect(result.get("elena")!.lines[0].paidAmount).toBe(570)
      expect(result.get("elena")!.lines[0].percentPaid).toBe(100)
    })

    it("partial reconciliation shows the same percent across all professionals on the invoice", () => {
      const invoices = [
        makeInvoice({
          invoiceProfessionalId: "elena",
          invoiceTotalAmount: 1000,
          items: [
            { total: 600, isCredit: false, attendingProfessionalId: "livia" },
            { total: 400, isCredit: false, attendingProfessionalId: "elena" },
          ],
        }),
      ]
      const profs = new Map([
        ["elena", { repassePercent: 50 }],
        ["livia", { repassePercent: 50 }],
      ])
      const paid = new Map([["inv-1", 500]])

      const result = buildRepasseFromInvoices(invoices, profs, taxPercent, paid)
      expect(result.get("livia")!.lines[0].paidAmount).toBe(300)
      expect(result.get("livia")!.lines[0].percentPaid).toBe(50)
      expect(result.get("elena")!.lines[0].paidAmount).toBe(200)
      expect(result.get("elena")!.lines[0].percentPaid).toBe(50)
    })
  })
})

describe("calculateRepasseSummary", () => {
  it("sums lines and computes received percentage", () => {
    const lines: RepasseInvoiceLine[] = [
      { invoiceId: "a", patientName: "A", totalSessions: 1, grossValue: 400, taxAmount: 40, afterTax: 360, repasseValue: 180, paidAmount: 400, percentPaid: 100 },
      { invoiceId: "b", patientName: "B", totalSessions: 1, grossValue: 600, taxAmount: 60, afterTax: 540, repasseValue: 270, paidAmount: 300, percentPaid: 50 },
    ]
    const summary = calculateRepasseSummary(lines)
    expect(summary.totalGross).toBe(1000)
    expect(summary.totalReceived).toBe(700)
    expect(summary.percentReceived).toBe(70)
  })

  it("returns zeros for empty lines", () => {
    expect(calculateRepasseSummary([])).toEqual({
      totalInvoices: 0, totalSessions: 0, totalGross: 0, totalTax: 0,
      totalAfterTax: 0, totalRepasse: 0, totalReceived: 0, percentReceived: 0,
    })
  })
})
