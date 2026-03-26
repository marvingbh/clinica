import { describe, it, expect } from "vitest"
import { createCsvParser } from "./csv-parser"

describe("csvParser", () => {
  const defaultOptions = {
    dateColumn: 0,
    amountColumn: 1,
    descriptionColumn: 2,
  }

  it("parses semicolon-delimited CSV with BRL format", () => {
    const csv = `Data;Valor;Descrição
15/03/2026;-1.500,00;PIX FORNECEDOR ABC
16/03/2026;2.300,50;TED RECEBIDA CLIENTE`

    const parser = createCsvParser({ ...defaultOptions, delimiter: ";" })
    const result = parser.parse(csv)

    expect(result).toHaveLength(2)
    expect(result[0].date).toBe("2026-03-15")
    expect(result[0].amount).toBe(1500)
    expect(result[0].type).toBe("DEBIT")
    expect(result[0].description).toBe("PIX FORNECEDOR ABC")

    expect(result[1].date).toBe("2026-03-16")
    expect(result[1].amount).toBe(2300.50)
    expect(result[1].type).toBe("CREDIT")
  })

  it("auto-detects semicolon delimiter", () => {
    const csv = `Data;Valor;Desc
01/01/2026;-100,00;TESTE`

    const parser = createCsvParser(defaultOptions)
    const result = parser.parse(csv)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
  })

  it("handles comma-delimited CSV", () => {
    const csv = `Date,Amount,Description
2026-03-01,-500.00,Office supplies`

    const parser = createCsvParser({
      ...defaultOptions,
      delimiter: ",",
      dateFormat: "YYYY-MM-DD",
    })
    const result = parser.parse(csv)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe("2026-03-01")
    expect(result[0].amount).toBe(500)
  })

  it("skips rows with missing data", () => {
    const csv = `Data;Valor;Desc
15/03/2026;;PIX
;-100,00;TED`

    const parser = createCsvParser({ ...defaultOptions, delimiter: ";" })
    const result = parser.parse(csv)
    expect(result).toHaveLength(0)
  })

  it("handles quoted fields with delimiter inside", () => {
    const csv = `Data;Valor;Desc
15/03/2026;-100,00;"PIX; pagamento mensal"`

    const parser = createCsvParser({ ...defaultOptions, delimiter: ";" })
    const result = parser.parse(csv)
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe("PIX; pagamento mensal")
  })

  it("generates unique externalIds", () => {
    const csv = `Data;Valor;Desc
15/03/2026;-100,00;PIX A
15/03/2026;-200,00;PIX B`

    const parser = createCsvParser({ ...defaultOptions, delimiter: ";" })
    const result = parser.parse(csv)
    expect(result[0].externalId).not.toBe(result[1].externalId)
  })
})
