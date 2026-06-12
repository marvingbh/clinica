import { describe, it, expect } from "vitest"
import {
  buildReciboBatchFile,
  buildReciboBatchFileName,
  RECIBO_LAYOUT_VERSION,
} from "./recibo-file-builder"
import type { ExportableRecibo, ReciboIssuer } from "./types"

const issuer: ReciboIssuer = { cpf: "111.444.777-35", crp: "CRP06/12345", name: "Dra. Ana" }

function recibo(overrides: Partial<ExportableRecibo> = {}): ExportableRecibo {
  return {
    paymentKey: "recl:l1",
    paymentDate: new Date("2025-02-05"),
    amount: 200,
    beneficiaryCpf: "529.982.247-25",
    beneficiaryName: "Maria",
    beneficiaryBirthDate: new Date("2010-05-20"),
    payerCpf: "390.533.447-05",
    payerName: "João Pai",
    ...overrides,
  }
}

describe("buildReciboBatchFile", () => {
  it("produces a version-tagged header and one detail line per receipt", () => {
    const file = buildReciboBatchFile([recibo()], issuer)
    const lines = file.trimEnd().split("\n")
    expect(lines[0]).toBe(`H|${RECIBO_LAYOUT_VERSION}|11144477735|CRP06/12345|Dra. Ana|1`)
    expect(lines[1]).toBe(
      "R|recl:l1|2025-02-05|52998224725|Maria|2010-05-20|39053344705|João Pai|20000"
    )
  })

  it("sorts detail lines by payment date ascending", () => {
    const file = buildReciboBatchFile(
      [
        recibo({ paymentKey: "recl:b", paymentDate: new Date("2025-03-10") }),
        recibo({ paymentKey: "recl:a", paymentDate: new Date("2025-01-05") }),
      ],
      issuer
    )
    const lines = file.trimEnd().split("\n").slice(1)
    expect(lines[0]).toContain("recl:a")
    expect(lines[1]).toContain("recl:b")
  })

  it("writes amounts as integer centavos with no separator", () => {
    const file = buildReciboBatchFile([recibo({ amount: 199.9 })], issuer)
    expect(file).toContain("|19990\n")
  })

  it("strips CPF masks in beneficiary and payer columns", () => {
    const file = buildReciboBatchFile([recibo()], issuer)
    expect(file).toContain("|52998224725|")
    expect(file).toContain("|39053344705|")
  })

  it("sanitizes the pipe separator out of free text", () => {
    const file = buildReciboBatchFile([recibo({ payerName: "A|B" })], issuer)
    expect(file).not.toContain("A|B")
    expect(file).toContain("A B")
  })

  it("ends each line with a newline", () => {
    const file = buildReciboBatchFile([recibo()], issuer)
    expect(file.endsWith("\n")).toBe(true)
  })
})

describe("buildReciboBatchFileName", () => {
  it("embeds the issuer CPF and a timestamp", () => {
    const name = buildReciboBatchFileName(issuer, new Date("2026-01-15T09:05:00"))
    expect(name).toBe("recibos-saude_11144477735_20260115-0905.txt")
  })
})
