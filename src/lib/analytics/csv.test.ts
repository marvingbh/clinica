import { describe, it, expect } from "vitest"
import { toCsvBr, formatNumberBr, csvFilename } from "./csv"

const BOM = "﻿"

describe("formatNumberBr", () => {
  it("uses comma decimal and dot thousands", () => {
    expect(formatNumberBr(1234.5)).toBe("1.234,5")
  })

  it("formats integers without decimals by default", () => {
    expect(formatNumberBr(1000)).toBe("1.000")
  })

  it("respects an explicit decimals argument", () => {
    expect(formatNumberBr(12, 2)).toBe("12,00")
    expect(formatNumberBr(0.5, 1)).toBe("0,5")
  })

  it("returns 0 for non-finite input", () => {
    expect(formatNumberBr(NaN)).toBe("0")
    expect(formatNumberBr(Infinity)).toBe("0")
  })
})

describe("toCsvBr", () => {
  it("prefixes a BOM", () => {
    const csv = toCsvBr(["A"], [["x"]])
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it("uses ; as the delimiter", () => {
    const csv = toCsvBr(["A", "B"], [["x", "y"]])
    expect(csv).toContain("A;B")
    expect(csv).toContain("x;y")
  })

  it("uses CRLF line endings and a trailing CRLF", () => {
    const csv = toCsvBr(["A"], [["x"], ["y"]])
    expect(csv).toBe(`${BOM}A\r\nx\r\ny\r\n`)
  })

  it("quotes cells containing the delimiter", () => {
    const csv = toCsvBr(["A"], [["a;b"]])
    expect(csv).toContain('"a;b"')
  })

  it("escapes embedded quotes by doubling them", () => {
    const csv = toCsvBr(["A"], [['he said "hi"']])
    expect(csv).toContain('"he said ""hi"""')
  })

  it("quotes cells containing line breaks", () => {
    const csv = toCsvBr(["A"], [["line1\nline2"]])
    expect(csv).toContain('"line1\nline2"')
  })

  it("formats numeric cells in pt-BR", () => {
    const csv = toCsvBr(["N"], [[1234.5]])
    expect(csv).toContain("1.234,5")
  })

  it("renders null cells as empty", () => {
    const csv = toCsvBr(["A", "B"], [[null, "x"]])
    expect(csv).toContain(";x")
  })
})

describe("csvFilename", () => {
  it("builds a month filename with zero padding", () => {
    expect(csvFilename("ocupacao", { year: 2026, month: 5 })).toBe("ocupacao-2026-05.csv")
  })

  it("builds a quarter filename", () => {
    expect(csvFilename("ocupacao", { year: 2026, quarter: 2 })).toBe("ocupacao-2026-T2.csv")
  })

  it("builds a year filename", () => {
    expect(csvFilename("ocupacao", { year: 2026 })).toBe("ocupacao-2026.csv")
  })
})
