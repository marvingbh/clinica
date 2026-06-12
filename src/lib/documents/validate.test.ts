import { describe, it, expect } from "vitest"
import {
  validateGeneration,
  isMinor,
  canGenerateClinicalDoc,
  CLINICAL_DOCUMENT_TYPES,
} from "./validate"
import type { MergeContext } from "./types"

function baseCtx(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    patient: {
      name: "Maria Silva",
      cpf: "12345678909",
      birthDate: new Date("1990-05-10T00:00:00Z"),
      billingResponsibleName: "Resp",
      motherName: null,
      fatherName: null,
      email: null,
      phone: "5511999990000",
    },
    professional: { name: "Dra. Ana", crp: "CRP06/12345", cpf: "98765432100" },
    clinic: { name: "Clínica", cnpj: "12345678000199", timezone: "America/Sao_Paulo", address: null, phone: null, email: null },
    appointment: { scheduledAt: new Date("2026-06-11T13:00:00Z"), endAt: new Date("2026-06-11T13:50:00Z") },
    sessionRows: [{ date: "01/06/2026", durationMinutes: 50, unitPrice: "R$ 200,00", invoiceItemId: "i1" }],
    manualFields: {},
    generatedAt: new Date("2026-06-11T13:00:00Z"),
    ...overrides,
  }
}

describe("validateGeneration", () => {
  it("blocks recibo without patient CPF and provides a quick-fix path", () => {
    const ctx = baseCtx({ patient: { ...baseCtx().patient, cpf: null } })
    const missing = validateGeneration("RECIBO_REEMBOLSO", ["patientCpf", "patientName", "sessionList", "totalValue", "crp", "professionalCpfCnpj"], ctx)
    const cpfMissing = missing.find((m) => m.key === "patientCpf")
    expect(cpfMissing).toBeDefined()
    expect(cpfMissing!.quickFixPath).toBe("/patients")
  })

  it("blocks any type when CRP is missing", () => {
    const ctx = baseCtx({ professional: { name: "Dra. Ana", crp: null, cpf: "98765432100" } })
    const missing = validateGeneration("DECLARACAO_COMPARECIMENTO", ["patientName", "appointmentDate", "appointmentStartTime", "appointmentEndTime", "professionalName", "crp"], ctx)
    expect(missing.some((m) => m.key === "crp")).toBe(true)
  })

  it("blocks contrato terapêutico for a minor without a guardian", () => {
    const ctx = baseCtx({
      patient: { ...baseCtx().patient, birthDate: new Date("2015-01-01T00:00:00Z"), billingResponsibleName: null, motherName: null, fatherName: null },
    })
    const missing = validateGeneration("CONTRATO_TERAPEUTICO", ["patientName", "guardianName"], ctx)
    expect(missing.some((m) => m.key === "guardianName")).toBe(true)
  })

  it("does not require a guardian for an adult contrato", () => {
    const ctx = baseCtx({
      patient: { ...baseCtx().patient, billingResponsibleName: null, motherName: null, fatherName: null },
    })
    const missing = validateGeneration("CONTRATO_TERAPEUTICO", ["patientName"], ctx)
    expect(missing.some((m) => m.key === "guardianName")).toBe(false)
  })

  it("blocks recibo when sessionList is present but no rows exist", () => {
    const ctx = baseCtx({ sessionRows: [] })
    const missing = validateGeneration("RECIBO_REEMBOLSO", ["patientName", "patientCpf", "sessionList", "totalValue", "crp", "professionalCpfCnpj"], ctx)
    expect(missing.some((m) => m.key === "sessionList")).toBe(true)
  })

  it("returns empty when everything resolves", () => {
    const missing = validateGeneration("DECLARACAO_COMPARECIMENTO", ["patientName", "appointmentDate", "appointmentStartTime", "appointmentEndTime", "professionalName", "crp"], baseCtx())
    expect(missing).toEqual([])
  })
})

describe("isMinor", () => {
  it("returns true for someone under 18", () => {
    expect(isMinor(new Date("2015-01-01T00:00:00Z"), new Date("2026-06-11T00:00:00Z"))).toBe(true)
  })

  it("returns false for an adult", () => {
    expect(isMinor(new Date("1990-05-10T00:00:00Z"), new Date("2026-06-11T00:00:00Z"))).toBe(false)
  })

  it("returns false exactly on the 18th birthday", () => {
    expect(isMinor(new Date("2008-06-11T00:00:00Z"), new Date("2026-06-11T00:00:00Z"))).toBe(false)
  })

  it("returns true the day before the 18th birthday", () => {
    expect(isMinor(new Date("2008-06-12T00:00:00Z"), new Date("2026-06-11T00:00:00Z"))).toBe(true)
  })

  it("returns false when birthDate is null", () => {
    expect(isMinor(null, new Date())).toBe(false)
  })
})

describe("canGenerateClinicalDoc", () => {
  it("always allows when restriction is off", () => {
    for (const type of CLINICAL_DOCUMENT_TYPES) {
      expect(canGenerateClinicalDoc(type, false, null)).toBe(true)
    }
  })

  it("blocks clinical types for a user without a professional profile when restricted", () => {
    for (const type of CLINICAL_DOCUMENT_TYPES) {
      expect(canGenerateClinicalDoc(type, true, null)).toBe(false)
      expect(canGenerateClinicalDoc(type, true, "prof-1")).toBe(true)
    }
  })

  it("never blocks non-clinical types", () => {
    expect(canGenerateClinicalDoc("DECLARACAO_COMPARECIMENTO", true, null)).toBe(true)
    expect(canGenerateClinicalDoc("RECIBO_REEMBOLSO", true, null)).toBe(true)
    expect(canGenerateClinicalDoc("ENCAMINHAMENTO", true, null)).toBe(true)
    expect(canGenerateClinicalDoc("CONTRATO_TERAPEUTICO", true, null)).toBe(true)
  })
})
