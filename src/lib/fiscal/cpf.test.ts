import { describe, it, expect } from "vitest"
import { validateCpf, formatCpf, stripCpf } from "./cpf"

describe("validateCpf", () => {
  it("accepts a valid CPF without mask", () => {
    expect(validateCpf("52998224725")).toBe(true)
  })

  it("accepts a valid CPF with mask", () => {
    expect(validateCpf("529.982.247-25")).toBe(true)
  })

  it("rejects a CPF with a wrong check digit", () => {
    expect(validateCpf("52998224724")).toBe(false)
  })

  it("rejects a CPF with the wrong length", () => {
    expect(validateCpf("5299822472")).toBe(false)
    expect(validateCpf("529982247250")).toBe(false)
  })

  it("rejects repeated-digit CPFs", () => {
    expect(validateCpf("00000000000")).toBe(false)
    expect(validateCpf("11111111111")).toBe(false)
    expect(validateCpf("99999999999")).toBe(false)
  })

  it("rejects empty / garbage input", () => {
    expect(validateCpf("")).toBe(false)
    expect(validateCpf("abc")).toBe(false)
  })
})

describe("formatCpf", () => {
  it("formats 11 digits as 000.000.000-00", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25")
  })

  it("formats an already-masked CPF idempotently", () => {
    expect(formatCpf("529.982.247-25")).toBe("529.982.247-25")
  })

  it("returns the input when not 11 digits", () => {
    expect(formatCpf("123")).toBe("123")
  })
})

describe("stripCpf", () => {
  it("removes all non-digits", () => {
    expect(stripCpf("529.982.247-25")).toBe("52998224725")
    expect(stripCpf("abc")).toBe("")
  })
})
