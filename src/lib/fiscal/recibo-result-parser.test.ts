import { describe, it, expect } from "vitest"
import { parseReciboResultFile } from "./recibo-result-parser"
import { buildReciboBatchFile } from "./recibo-file-builder"
import { FiscalParseError } from "./types"
import type { ExportableRecibo, ReciboIssuer } from "./types"

describe("parseReciboResultFile", () => {
  it("parses a success line with the recibo number", () => {
    const result = parseReciboResultFile("S|recl:l1|RS-000123")
    expect(result).toEqual([{ paymentKey: "recl:l1", outcome: "EMITIDO", reciboNumero: "RS-000123" }])
  })

  it("parses an error line with the RFB message", () => {
    const result = parseReciboResultFile("E|inv:i1|CPF do pagador invalido")
    expect(result).toEqual([
      { paymentKey: "inv:i1", outcome: "ERRO", message: "CPF do pagador invalido" },
    ])
  })

  it("parses a mixed file and ignores header + blank lines", () => {
    const content = ["H|cabecalho", "", "S|recl:l1|RS-1", "E|recl:l2|erro X", ""].join("\n")
    const result = parseReciboResultFile(content)
    expect(result).toHaveLength(2)
    expect(result[0].outcome).toBe("EMITIDO")
    expect(result[1].outcome).toBe("ERRO")
  })

  it("throws FiscalParseError on an empty file", () => {
    expect(() => parseReciboResultFile("")).toThrow(FiscalParseError)
    expect(() => parseReciboResultFile("   \n  ")).toThrow(FiscalParseError)
  })

  it("throws FiscalParseError on garbage", () => {
    expect(() => parseReciboResultFile("not a valid file at all")).toThrow(FiscalParseError)
  })

  it("roundtrips with the batch builder (line reference is reversible)", () => {
    const issuer: ReciboIssuer = { cpf: "11144477735", crp: "CRP06/1", name: "Ana" }
    const rows: ExportableRecibo[] = [
      {
        paymentKey: "recl:l1",
        paymentDate: new Date("2025-02-05"),
        amount: 200,
        beneficiaryCpf: "52998224725",
        beneficiaryName: "Maria",
        beneficiaryBirthDate: new Date("2010-05-20"),
        payerCpf: "39053344705",
        payerName: "Joao",
      },
      {
        paymentKey: "inv:i2",
        paymentDate: new Date("2025-03-10"),
        amount: 150,
        beneficiaryCpf: "39053344705",
        beneficiaryName: "Carlos",
        beneficiaryBirthDate: new Date("1980-01-01"),
        payerCpf: "39053344705",
        payerName: "Carlos",
      },
    ]
    const batch = buildReciboBatchFile(rows, issuer)

    // Derive a result file: each detail line (field index 1 = paymentKey) gets a success outcome.
    const keys = batch
      .trimEnd()
      .split("\n")
      .filter((l) => l.startsWith("R|"))
      .map((l) => l.split("|")[1])
    const resultFile = keys.map((k, i) => `S|${k}|RS-${i}`).join("\n")

    const parsed = parseReciboResultFile(resultFile)
    expect(parsed.map((p) => p.paymentKey)).toEqual(["recl:l1", "inv:i2"])
    expect(parsed.every((p) => p.outcome === "EMITIDO")).toBe(true)
  })
})
