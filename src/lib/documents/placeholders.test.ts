import { describe, it, expect } from "vitest"
import {
  PLACEHOLDERS,
  getPlaceholder,
  resolveValues,
  resolveProfessionalCpfCnpj,
  resolveGuardianName,
  formatDateInTz,
  formatTimeInTz,
} from "./placeholders"
import type { MergeContext } from "./types"
import { SESSION_TABLE_TOKEN } from "./types"

function baseCtx(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    patient: {
      name: "Maria Silva",
      cpf: "12345678909",
      birthDate: new Date("1990-05-10T00:00:00Z"),
      billingResponsibleName: null,
      motherName: null,
      fatherName: null,
      email: "maria@example.com",
      phone: "5511999990000",
    },
    professional: { name: "Dra. Ana", crp: "CRP06/12345", cpf: "98765432100" },
    clinic: {
      name: "Clínica Bem-Estar",
      cnpj: "12345678000199",
      timezone: "America/Sao_Paulo",
      address: "Rua A, 100",
      phone: "1133334444",
      email: "contato@clinica.com",
    },
    appointment: {
      scheduledAt: new Date("2026-06-11T13:00:00Z"), // 10:00 in São Paulo (UTC-3)
      endAt: new Date("2026-06-11T13:50:00Z"), // 10:50
    },
    sessionRows: [],
    manualFields: {},
    generatedAt: new Date("2026-06-11T13:00:00Z"),
    ...overrides,
  }
}

describe("PLACEHOLDERS registry", () => {
  it("has NO clinical/diagnosis placeholder (CFP guard)", () => {
    const keys = PLACEHOLDERS.map((p) => p.key.toLowerCase())
    for (const forbidden of ["cid", "diagnostico", "diagnosis", "diagnostic", "hipotesediagnostica"]) {
      expect(keys.some((k) => k.includes(forbidden))).toBe(false)
    }
  })

  it("getPlaceholder finds a known key and returns undefined otherwise", () => {
    expect(getPlaceholder("patientName")?.label).toBe("Nome do paciente")
    expect(getPlaceholder("doesNotExist")).toBeUndefined()
  })
})

describe("auto placeholders resolve from context", () => {
  it("patientName, professionalName, crp, clinicName", () => {
    const ctx = baseCtx()
    expect(getPlaceholder("patientName")!.resolve(ctx)).toBe("Maria Silva")
    expect(getPlaceholder("professionalName")!.resolve(ctx)).toBe("Dra. Ana")
    expect(getPlaceholder("crp")!.resolve(ctx)).toBe("CRP06/12345")
    expect(getPlaceholder("clinicName")!.resolve(ctx)).toBe("Clínica Bem-Estar")
  })

  it("patientCpf formats 11 digits", () => {
    expect(getPlaceholder("patientCpf")!.resolve(baseCtx())).toBe("123.456.789-09")
  })

  it("patientCpf returns null when absent or malformed", () => {
    expect(getPlaceholder("patientCpf")!.resolve(baseCtx({ patient: { ...baseCtx().patient, cpf: null } }))).toBeNull()
    expect(getPlaceholder("patientCpf")!.resolve(baseCtx({ patient: { ...baseCtx().patient, cpf: "123" } }))).toBeNull()
  })

  it("sessionList resolves to the table token only when rows exist", () => {
    expect(getPlaceholder("sessionList")!.resolve(baseCtx())).toBeNull()
    const withRows = baseCtx({
      sessionRows: [{ date: "01/06/2026", durationMinutes: 50, unitPrice: "R$ 200,00", invoiceItemId: "i1" }],
    })
    expect(getPlaceholder("sessionList")!.resolve(withRows)).toBe(SESSION_TABLE_TOKEN)
  })

  it("totalValue sums session rows", () => {
    const ctx = baseCtx({
      sessionRows: [
        { date: "01/06/2026", durationMinutes: 50, unitPrice: "R$ 200,00", invoiceItemId: "i1" },
        { date: "08/06/2026", durationMinutes: 50, unitPrice: "R$ 150,50", invoiceItemId: "i2" },
      ],
    })
    expect(getPlaceholder("totalValue")!.resolve(ctx)).toBe("R$ 350,50")
  })
})

describe("guardianName fallback chain", () => {
  it("uses billingResponsibleName first", () => {
    const ctx = baseCtx({
      patient: { ...baseCtx().patient, billingResponsibleName: "Resp Pagador", motherName: "Mãe", fatherName: "Pai" },
    })
    expect(resolveGuardianName(ctx)).toBe("Resp Pagador")
  })

  it("falls to motherName then fatherName then null", () => {
    expect(resolveGuardianName(baseCtx({ patient: { ...baseCtx().patient, motherName: "Mãe", fatherName: "Pai" } }))).toBe("Mãe")
    expect(resolveGuardianName(baseCtx({ patient: { ...baseCtx().patient, fatherName: "Pai" } }))).toBe("Pai")
    expect(resolveGuardianName(baseCtx())).toBeNull()
  })
})

describe("professionalCpfCnpj", () => {
  it("formats the professional CPF (11 digits)", () => {
    expect(resolveProfessionalCpfCnpj(baseCtx())).toBe("987.654.321-00")
  })

  it("falls back to clinic CNPJ (14 digits) when no professional cpf", () => {
    const ctx = baseCtx({ professional: { name: "Dra. Ana", crp: "CRP06/12345", cpf: null } })
    expect(resolveProfessionalCpfCnpj(ctx)).toBe("12.345.678/0001-99")
  })

  it("returns null when neither is available", () => {
    const ctx = baseCtx({
      professional: { name: "Dra. Ana", crp: "CRP06/12345", cpf: null },
      clinic: { ...baseCtx().clinic, cnpj: null },
    })
    expect(resolveProfessionalCpfCnpj(ctx)).toBeNull()
  })
})

describe("date/time formatting in clinic timezone", () => {
  it("formats appointmentDate and times in America/Sao_Paulo", () => {
    const ctx = baseCtx()
    expect(getPlaceholder("appointmentDate")!.resolve(ctx)).toBe("11/06/2026")
    expect(getPlaceholder("appointmentStartTime")!.resolve(ctx)).toBe("10:00")
    expect(getPlaceholder("appointmentEndTime")!.resolve(ctx)).toBe("10:50")
  })

  it("formatDateInTz / formatTimeInTz honor the given timezone", () => {
    const d = new Date("2026-06-11T02:30:00Z")
    expect(formatDateInTz(d, "America/Sao_Paulo")).toBe("10/06/2026")
    expect(formatTimeInTz(d, "America/Sao_Paulo")).toBe("23:30")
  })
})

describe("resolveValues", () => {
  it("separates resolved values from unresolved keys", () => {
    const ctx = baseCtx({ professional: { name: "Dra. Ana", crp: null, cpf: null } })
    const { values, unresolved } = resolveValues(["patientName", "crp", "unknownKey"], ctx)
    expect(values.patientName).toBe("Maria Silva")
    expect(unresolved).toContain("crp")
    expect(unresolved).toContain("unknownKey")
    expect(values.crp).toBeUndefined()
  })
})
