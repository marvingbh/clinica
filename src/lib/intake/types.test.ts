import { describe, it, expect } from "vitest"
import { intakeSubmissionSchema, normalizePhone, normalizeCpfCnpj } from "./types"

const validInput = {
  childName: "Maria Silva",
  childBirthDate: "2018-05-15",
  guardianName: "Ana Silva",
  guardianCpfCnpj: "12345678901",
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
      guardianCpfCnpj: "12345678901",
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

  it("rejects short CPF", () => {
    const input = { ...validInput, guardianCpfCnpj: "123" }
    const result = intakeSubmissionSchema.safeParse(input)
    expect(result.success).toBe(false)
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
