import { describe, it, expect } from "vitest"
import { aggregateDmed } from "./dmed-aggregation"
import type { ReciboRow } from "./types"

function row(overrides: Partial<ReciboRow> = {}): ReciboRow {
  const base: ReciboRow = {
    paymentKey: "recl:l1",
    invoiceId: "inv1",
    reconciliationLinkId: "l1",
    paymentDate: new Date("2025-06-01"),
    amount: 100,
    patientId: "pat1",
    professionalProfileId: "prof1",
    refundedAmount: 0,
    beneficiary: { cpf: "52998224725", name: "Maria", birthDate: new Date("2010-05-20") },
    payer: { cpf: "52998224725", name: "Maria", birthDate: null },
    professional: {
      id: "prof1",
      name: "Ana",
      cpf: "11144477735",
      crp: "CRP06/1",
      fiscalRegime: "PJ",
      fiscalRegimeSince: null,
    },
    blockers: [],
    refundWarning: false,
    fullyRefunded: false,
  }
  return { ...base, ...overrides }
}

describe("aggregateDmed", () => {
  it("groups by payer CPF and totals", () => {
    const report = aggregateDmed([row({ amount: 100 }), row({ amount: 50 })], 2025)
    expect(report.payers).toHaveLength(1)
    expect(report.payers[0].cpf).toBe("52998224725")
    expect(report.payers[0].total).toBe(150)
    expect(report.grandTotal).toBe(150)
  })

  it("omits the beneficiary list when payer = beneficiary", () => {
    const report = aggregateDmed([row()], 2025)
    expect(report.payers[0].beneficiaries).toEqual([])
  })

  it("lists the beneficiary when payer ≠ beneficiary", () => {
    const report = aggregateDmed([
      row({
        beneficiary: { cpf: "52998224725", name: "Filho", birthDate: new Date("2015-01-01") },
        payer: { cpf: "39053344705", name: "Pai", birthDate: null },
      }),
    ], 2025)
    expect(report.payers[0].cpf).toBe("39053344705")
    expect(report.payers[0].beneficiaries).toHaveLength(1)
    expect(report.payers[0].beneficiaries[0].name).toBe("Filho")
  })

  it("aggregates two beneficiaries under the same payer", () => {
    const report = aggregateDmed([
      row({
        beneficiary: { cpf: "52998224725", name: "Filho A", birthDate: new Date("2015-01-01") },
        payer: { cpf: "39053344705", name: "Pai", birthDate: null },
      }),
      row({
        beneficiary: { cpf: "11144477735", name: "Filho B", birthDate: new Date("2017-01-01") },
        payer: { cpf: "39053344705", name: "Pai", birthDate: null },
      }),
    ], 2025)
    expect(report.payers).toHaveLength(1)
    expect(report.payers[0].beneficiaries).toHaveLength(2)
  })

  it("filters by year (payment date drives competence)", () => {
    const report = aggregateDmed(
      [
        row({ paymentDate: new Date("2025-01-01"), amount: 100 }),
        row({ paymentDate: new Date("2024-12-31"), amount: 999 }),
      ],
      2025
    )
    expect(report.grandTotal).toBe(100)
  })

  it("excludes blocked rows from totals but counts them in the ledger diff", () => {
    const report = aggregateDmed(
      [row({ amount: 100 }), row({ amount: 40, blockers: ["PAGADOR_SEM_CPF"] })],
      2025
    )
    expect(report.grandTotal).toBe(100)
    expect(report.ledgerTotal).toBe(140)
    expect(report.unexplainedDiff).toBe(40)
  })

  it("ledgerTotal equals grandTotal when nothing is blocked", () => {
    const report = aggregateDmed([row({ amount: 100 }), row({ amount: 50 })], 2025)
    expect(report.ledgerTotal).toBe(150)
    expect(report.unexplainedDiff).toBe(0)
  })
})
