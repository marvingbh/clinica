import { describe, it, expect } from "vitest"
import { formatCnpj, formatCpf, formatBRL, formatDateTimeBR, formatCep } from "./danfse-format"

describe("formatCnpj", () => {
  it("formats 14-digit CNPJ", () => {
    expect(formatCnpj("12345678000195")).toBe("12.345.678/0001-95")
  })

  it("strips non-digits and formats", () => {
    expect(formatCnpj("12.345.678/0001-95")).toBe("12.345.678/0001-95")
  })

  it("pads short input", () => {
    expect(formatCnpj("1234")).toBe("00.000.000/0012-34")
  })
})

describe("formatCpf", () => {
  it("formats 11-digit CPF", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01")
  })

  it("strips non-digits and formats", () => {
    expect(formatCpf("123.456.789-01")).toBe("123.456.789-01")
  })

  it("pads short input", () => {
    expect(formatCpf("123")).toBe("000.000.001-23")
  })
})

describe("formatBRL", () => {
  it("formats positive amounts", () => {
    expect(formatBRL(1500.5)).toBe("R$ 1.500,50")
  })

  it("formats zero", () => {
    expect(formatBRL(0)).toBe("R$ 0,00")
  })

  it("formats whole numbers", () => {
    expect(formatBRL(200)).toBe("R$ 200,00")
  })
})

describe("formatDateTimeBR", () => {
  it("formats Date object", () => {
    const d = new Date(2026, 2, 16, 14, 30) // March 16, 2026 14:30
    expect(formatDateTimeBR(d)).toBe("16/03/2026 14:30")
  })

  it("formats ISO string", () => {
    // Use a specific timezone-safe approach
    const result = formatDateTimeBR("2026-03-16T14:30:00")
    expect(result).toMatch(/16\/03\/2026/)
  })
})

describe("formatCep", () => {
  it("formats 8-digit CEP", () => {
    expect(formatCep("30130000")).toBe("30130-000")
  })

  it("strips non-digits", () => {
    expect(formatCep("30.130-000")).toBe("30130-000")
  })
})
