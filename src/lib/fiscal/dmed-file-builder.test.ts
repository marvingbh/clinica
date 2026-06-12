import { describe, it, expect } from "vitest"
import { buildDmedFile, validateDmedConfig, DMED_LAYOUT_VERSION } from "./dmed-file-builder"
import type { DmedConfig, DmedReport } from "./types"

const config: DmedConfig = {
  cnpj: "11222333000181",
  nomeEmpresarial: "Clinica Exemplo LTDA",
  responsavelCpf: "11144477735",
  responsavelNome: "Ana Responsavel",
  responsavelDdd: "11",
  responsavelTelefone: "999998888",
}

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
    { cpf: "11144477735", name: "Solo", total: 150, beneficiaries: [] },
  ],
}

describe("buildDmedFile", () => {
  it("emits header, responsible, payer and beneficiary records in order", () => {
    const lines = buildDmedFile(report, config).trimEnd().split("\n")
    expect(lines[0]).toBe(`DMED|${DMED_LAYOUT_VERSION}|2025|11222333000181|Clinica Exemplo LTDA`)
    expect(lines[1]).toBe("RESP|11144477735|Ana Responsavel|11|999998888")
    expect(lines[2]).toBe("PAG|39053344705|Pai|20000")
    expect(lines[3]).toBe("BEN|52998224725|Filho|2015-01-01|20000")
    expect(lines[4]).toBe("PAG|11144477735|Solo|15000")
    expect(lines[5]).toBe("T9|2|35000")
  })

  it("encodes totals in centavos", () => {
    const file = buildDmedFile(report, config)
    expect(file).toContain("|20000")
    expect(file).toContain("|35000")
  })
})

describe("validateDmedConfig", () => {
  it("returns no errors for a complete config", () => {
    expect(validateDmedConfig(config)).toEqual([])
  })

  it("reports missing/invalid CNPJ", () => {
    const errors = validateDmedConfig({ ...config, cnpj: "123" })
    expect(errors).toContain("CNPJ inválido ou ausente")
  })

  it("reports a missing nome empresarial", () => {
    const errors = validateDmedConfig({ ...config, nomeEmpresarial: "" })
    expect(errors).toContain("Nome empresarial obrigatório")
  })

  it("reports an invalid responsible CPF", () => {
    const errors = validateDmedConfig({ ...config, responsavelCpf: "00000000000" })
    expect(errors).toContain("CPF do responsável inválido ou ausente")
  })

  it("reports a missing responsible name", () => {
    const errors = validateDmedConfig({ ...config, responsavelNome: "  " })
    expect(errors).toContain("Nome do responsável obrigatório")
  })
})
