import { describe, it, expect } from "vitest"
import { filterPfReciboRows } from "./recibo-row-filter"
import type { ProfessionalRegimeInfo } from "./fiscal-period"
import type { ReciboRowView } from "./serialize"

function row(overrides: Partial<ReciboRowView>): ReciboRowView {
  return {
    paymentKey: "k1",
    invoiceId: "inv1",
    reconciliationLinkId: null,
    paymentDate: "2026-03-10",
    amount: 100,
    patientId: "p1",
    professionalProfileId: "prof-pf",
    professionalName: "Dra. PF",
    beneficiaryName: "Paciente",
    beneficiaryCpf: null,
    payerName: "Pagador",
    payerCpf: null,
    blockers: [],
    refundWarning: false,
    fullyRefunded: false,
    status: null,
    ...overrides,
  }
}

const professionals = new Map<string, ProfessionalRegimeInfo>([
  ["prof-pf", { fiscalRegime: "PF", fiscalRegimeSince: null }],
  ["prof-pj", { fiscalRegime: "PJ", fiscalRegimeSince: null }],
  ["prof-none", { fiscalRegime: null, fiscalRegimeSince: null }],
])

describe("filterPfReciboRows", () => {
  it("keeps rows owned by PF professionals", () => {
    const rows = [row({ professionalProfileId: "prof-pf" })]
    expect(filterPfReciboRows(rows, professionals)).toHaveLength(1)
  })

  it("drops rows owned by PJ professionals", () => {
    const rows = [row({ professionalProfileId: "prof-pj" })]
    expect(filterPfReciboRows(rows, professionals)).toHaveLength(0)
  })

  it("drops rows whose professional has no configured regime", () => {
    const rows = [row({ professionalProfileId: "prof-none" })]
    expect(filterPfReciboRows(rows, professionals)).toHaveLength(0)
  })

  it("drops rows whose professional is not in the map", () => {
    const rows = [row({ professionalProfileId: "ghost" })]
    expect(filterPfReciboRows(rows, professionals)).toHaveLength(0)
  })

  it("returns empty when no PF professional has rows", () => {
    const rows = [
      row({ paymentKey: "a", professionalProfileId: "prof-pj" }),
      row({ paymentKey: "b", professionalProfileId: "prof-none" }),
    ]
    expect(filterPfReciboRows(rows, professionals)).toEqual([])
  })

  it("honors regime-at-date for a professional who switched PJ -> PF", () => {
    const switching = new Map<string, ProfessionalRegimeInfo>([
      // Current regime PF, switched on 2026-06-01.
      ["prof-x", { fiscalRegime: "PF", fiscalRegimeSince: new Date("2026-06-01") }],
    ])
    const before = row({ professionalProfileId: "prof-x", paymentDate: "2026-05-15" })
    const after = row({ professionalProfileId: "prof-x", paymentDate: "2026-06-15" })
    // Payment before the switch was under the previous (PJ) regime -> dropped.
    expect(filterPfReciboRows([before], switching)).toHaveLength(0)
    // Payment after the switch is PF -> kept.
    expect(filterPfReciboRows([after], switching)).toHaveLength(1)
  })

  it("uses current regime for rows without a payment date", () => {
    const rows = [row({ professionalProfileId: "prof-pf", paymentDate: null })]
    expect(filterPfReciboRows(rows, professionals)).toHaveLength(1)
  })
})
