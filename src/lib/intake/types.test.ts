import { describe, it, expect } from "vitest"
import { intakeSubmissionSchema, normalizePhone, normalizeCpfCnpj, isValidCpfCnpj } from "./types"

// Valid CPF for testing (passes checksum): 529.982.247-25
const VALID_CPF = "52998224725"
// Valid CNPJ for testing: 11.222.333/0001-81
const VALID_CNPJ = "11222333000181"

const validInput = {
  childName: "Maria Silva",
  childBirthDate: "2018-05-15",
  guardianName: "Ana Silva",
  guardianCpfCnpj: VALID_CPF,
  phone: "11999887766",
  email: "ana@example.com",
  addressStreet: "Rua das Flores",
  addressNumber: "123",
  addressNeighborhood: "Centro",
  addressCity: "Sao Paulo",
  addressState: "SP",
  addressZip: "01234567",
  schoolName: "Escola Alegria",
  schoolUnit: "Unidade Norte",
  schoolShift: "Manha",
  motherName: "Ana Silva",
  motherPhone: "11999887766",
  fatherName: "Carlos Silva",
  fatherPhone: "11988776655",
  consentPhotoVideo: true,
  consentSessionRecording: true,
}

describe("intakeSubmissionSchema", () => {
  it("validates a complete valid submission", () => {
    const result = intakeSubmissionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it("accepts submission with only required fields", () => {
    const minimal = {
      childName: "Maria Silva",
      childBirthDate: "2018-05-15",
      guardianName: "Ana Silva",
      guardianCpfCnpj: VALID_CPF,
      phone: "11999887766",
      email: "ana@example.com",
      addressStreet: "Rua das Flores",
      addressZip: "01234567",
      consentPhotoVideo: false,
      consentSessionRecording: false,
    }
    const result = intakeSubmissionSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it("rejects missing child name", () => {
    const input = { ...validInput, childName: "" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects invalid birth date format", () => {
    const input = { ...validInput, childBirthDate: "15/05/2018" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects future birth date", () => {
    const input = { ...validInput, childBirthDate: "2099-01-01" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects impossible date like 2020-13-45", () => {
    const input = { ...validInput, childBirthDate: "2020-13-45" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects invalid phone", () => {
    const input = { ...validInput, phone: "123" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("accepts phone with country code", () => {
    const input = { ...validInput, phone: "+5511999887766" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("rejects invalid email", () => {
    const input = { ...validInput, email: "not-an-email" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects invalid CEP", () => {
    const input = { ...validInput, addressZip: "123" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("accepts empty optional parent phones", () => {
    const input = { ...validInput, motherPhone: "", fatherPhone: "" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("rejects invalid parent phone format", () => {
    const input = { ...validInput, motherPhone: "123" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects CPF with invalid checksum", () => {
    const input = { ...validInput, guardianCpfCnpj: "12345678901" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects all-same-digit CPF", () => {
    const input = { ...validInput, guardianCpfCnpj: "11111111111" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("accepts valid CNPJ", () => {
    const input = { ...validInput, guardianCpfCnpj: VALID_CNPJ }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe("isValidCpfCnpj", () => {
  // Known valid CPFs (different check digit patterns)
  it.each([
    "52998224725",
    "11144477735",
    "00000000191", // edge case: valid CPF with leading zeros
    "76381539011",
    "34785623179",
  ])("validates correct CPF: %s", (cpf) => {
    expect(isValidCpfCnpj(cpf)).toBe(true)
  })

  // All same digit CPFs (must all be rejected)
  it.each([
    "00000000000",
    "11111111111",
    "22222222222",
    "33333333333",
    "44444444444",
    "55555555555",
    "66666666666",
    "77777777777",
    "88888888888",
    "99999999999",
  ])("rejects all-same-digit CPF: %s", (cpf) => {
    expect(isValidCpfCnpj(cpf)).toBe(false)
  })

  // Invalid check digits
  it.each([
    "12345678901", // wrong first check digit
    "52998224724", // wrong second check digit (last digit off by 1)
    "52998224735", // wrong both check digits
    "11144477736", // off by 1
  ])("rejects CPF with bad checksum: %s", (cpf) => {
    expect(isValidCpfCnpj(cpf)).toBe(false)
  })

  // Known valid CNPJs
  it.each([
    "11222333000181",
    "11444777000161",
  ])("validates correct CNPJ: %s", (cnpj) => {
    expect(isValidCpfCnpj(cnpj)).toBe(true)
  })

  // Invalid CNPJs
  it.each([
    "12345678000190", // bad checksum
    "11222333000182", // off by 1
    "00000000000000", // all zeros
    "11111111111111", // all same digit
  ])("rejects invalid CNPJ: %s", (cnpj) => {
    expect(isValidCpfCnpj(cnpj)).toBe(false)
  })

  // Wrong lengths
  it.each([
    "",
    "123",
    "1234567890",   // 10 digits (too short for CPF)
    "123456789012",  // 12 digits (between CPF and CNPJ)
    "123456789012345", // 15 digits (too long for CNPJ)
  ])("rejects wrong length: '%s'", (val) => {
    expect(isValidCpfCnpj(val)).toBe(false)
  })

  // Handles formatted input (strips non-digits)
  it("validates formatted CPF with dots and dash", () => {
    expect(isValidCpfCnpj("529.982.247-25")).toBe(true)
  })

  it("validates formatted CNPJ with dots, slash and dash", () => {
    expect(isValidCpfCnpj("11.222.333/0001-81")).toBe(true)
  })
})

describe("normalizePhone", () => {
  it("strips non-digit characters", () => {
    expect(normalizePhone("+55 (11) 99988-7766")).toBe("5511999887766")
  })

  it("returns digits-only phone unchanged", () => {
    expect(normalizePhone("11999887766")).toBe("11999887766")
  })
})

describe("normalizeCpfCnpj", () => {
  it("strips formatting from CPF", () => {
    expect(normalizeCpfCnpj("123.456.789-01")).toBe("12345678901")
  })

  it("strips formatting from CNPJ", () => {
    expect(normalizeCpfCnpj("12.345.678/0001-90")).toBe("12345678000190")
  })
})
