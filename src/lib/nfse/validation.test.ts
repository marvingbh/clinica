import { describe, it, expect } from "vitest"
import { validateCnpj, nfseConfigSchema, nfseEmissionOverrideSchema } from "./validation"

// ============================================================================
// validateCnpj
// ============================================================================

describe("validateCnpj", () => {
  it("returns true for a valid CNPJ", () => {
    expect(validateCnpj("11222333000181")).toBe(true)
  })

  it("returns false for invalid check digits", () => {
    expect(validateCnpj("11222333000182")).toBe(false)
  })

  it("returns false when all digits are the same", () => {
    expect(validateCnpj("11111111111111")).toBe(false)
  })

  it("returns false for wrong length", () => {
    expect(validateCnpj("1122233300018")).toBe(false) // 13 digits
    expect(validateCnpj("112223330001811")).toBe(false) // 15 digits
  })

  it("strips formatting and validates", () => {
    expect(validateCnpj("11.222.333/0001-81")).toBe(true)
  })

  it("returns false for empty string", () => {
    expect(validateCnpj("")).toBe(false)
  })

  it("returns false for non-numeric input after stripping", () => {
    expect(validateCnpj("abcdefghijklmn")).toBe(false)
  })
})

// ============================================================================
// nfseConfigSchema
// ============================================================================

describe("nfseConfigSchema", () => {
  const validConfig = {
    cnpj: "11222333000181",
    inscricaoMunicipal: "12345",
    codigoMunicipio: "3550308",
    regimeTributario: "1",
    opSimpNac: 1,
    codigoServico: "01.01",
    aliquotaIss: 5,
    useSandbox: true,
  }

  it("accepts a valid config with all required fields", () => {
    const result = nfseConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
  })

  it("accepts valid config with optional fields", () => {
    const result = nfseConfigSchema.safeParse({
      ...validConfig,
      cnae: "8650002",
      codigoNbs: "1.0101",
      descricaoServico: "Serviços de psicologia",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid CNPJ", () => {
    const result = nfseConfigSchema.safeParse({
      ...validConfig,
      cnpj: "11222333000199",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty inscricaoMunicipal", () => {
    const result = nfseConfigSchema.safeParse({
      ...validConfig,
      inscricaoMunicipal: "",
    })
    expect(result.success).toBe(false)
  })

  it("rejects codigoMunicipio that is not 7 digits", () => {
    const result = nfseConfigSchema.safeParse({
      ...validConfig,
      codigoMunicipio: "355030", // 6 digits
    })
    expect(result.success).toBe(false)
  })

  it("rejects codigoMunicipio with letters", () => {
    const result = nfseConfigSchema.safeParse({
      ...validConfig,
      codigoMunicipio: "355030A",
    })
    expect(result.success).toBe(false)
  })

  it("accepts formatted CNPJ (strips before validating)", () => {
    const result = nfseConfigSchema.safeParse({
      ...validConfig,
      cnpj: "11.222.333/0001-81",
    })
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// nfseEmissionOverrideSchema
// ============================================================================

describe("nfseEmissionOverrideSchema", () => {
  it("accepts a valid override with all fields", () => {
    const result = nfseEmissionOverrideSchema.safeParse({
      codigoServico: "01.02",
      descricao: "Consulta de psicologia",
      aliquotaIss: 3.5,
    })
    expect(result.success).toBe(true)
  })

  it("accepts empty object (all fields optional)", () => {
    const result = nfseEmissionOverrideSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects negative aliquotaIss", () => {
    const result = nfseEmissionOverrideSchema.safeParse({
      aliquotaIss: -1,
    })
    expect(result.success).toBe(false)
  })

  it("rejects aliquotaIss greater than 100", () => {
    const result = nfseEmissionOverrideSchema.safeParse({
      aliquotaIss: 100.01,
    })
    expect(result.success).toBe(false)
  })

  it("accepts aliquotaIss at boundaries (0 and 100)", () => {
    expect(nfseEmissionOverrideSchema.safeParse({ aliquotaIss: 0 }).success).toBe(true)
    expect(nfseEmissionOverrideSchema.safeParse({ aliquotaIss: 100 }).success).toBe(true)
  })
})
