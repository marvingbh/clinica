import { describe, it, expect } from "vitest"
import { buildDmedCsv } from "./dmed-csv"
import type { DmedReport } from "./types"

const report: DmedReport = {
  year: 2025,
  grandTotal: 350,
  ledgerTotal: 350,
  unexplainedDiff: 0,
  payers: [
    {
      cpf: "39053344705",
      name: "Pai",
      total: 200,
      beneficiaries: [{ cpf: "52998224725", name: "Filho", birthDate: new Date("2015-01-01"), total: 200 }],
    },
  ],
}

describe("buildDmedCsv", () => {
  it("starts with a UTF-8 BOM", () => {
    expect(buildDmedCsv(report).charCodeAt(0)).toBe(0xfeff)
  })

  it("uses semicolons and pt-BR headers", () => {
    const csv = buildDmedCsv(report)
    expect(csv).toContain("Tipo;CPF;Nome;Nascimento;Total")
  })

  it("formats CPF and R$ values", () => {
    const csv = buildDmedCsv(report)
    expect(csv).toContain("390.533.447-05")
    expect(csv).toContain("R$ 200,00")
  })

  it("renders a beneficiary line with formatted birth date", () => {
    const csv = buildDmedCsv(report)
    expect(csv).toContain("Beneficiário")
    expect(csv).toContain("01/01/2015")
  })

  it("appends a grand total line", () => {
    const csv = buildDmedCsv(report)
    expect(csv).toContain("Total geral")
    expect(csv).toContain("R$ 350,00")
  })
})
