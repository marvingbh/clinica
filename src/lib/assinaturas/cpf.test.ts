import { describe, it, expect } from "vitest"
import { isValidCpf, normalizeCpf, formatCpf, maskCpf, cpfsMatch } from "./cpf"

const VALID = "52998224725"
const VALID_MASKED = "529.982.247-25"

describe("cpf", () => {
  it("validates a real CPF and rejects invalid/repeated/CNPJ", () => {
    expect(isValidCpf(VALID)).toBe(true)
    expect(isValidCpf(VALID_MASKED)).toBe(true)
    expect(isValidCpf("11111111111")).toBe(false) // all same digit
    expect(isValidCpf("12345678900")).toBe(false) // bad check digits
    expect(isValidCpf("11222333000181")).toBe(false) // CNPJ length rejected
  })

  it("normalizes a masked CPF to digits", () => {
    expect(normalizeCpf(VALID_MASKED)).toBe(VALID)
  })

  it("formats and masks", () => {
    expect(formatCpf(VALID)).toBe(VALID_MASKED)
    expect(maskCpf(VALID)).toBe("***.982.247-**")
  })

  it("cpfsMatch: null registered ⇒ true; equal ⇒ true; different ⇒ false", () => {
    expect(cpfsMatch(null, VALID)).toBe(true)
    expect(cpfsMatch("", VALID)).toBe(true)
    expect(cpfsMatch(VALID_MASKED, VALID)).toBe(true)
    expect(cpfsMatch(VALID, "11144477735")).toBe(false)
  })
})
