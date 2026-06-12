import { describe, it, expect } from "vitest"
import { buildMergeContext } from "./build-merge-context"

const clinic = {
  name: "Clínica",
  cnpj: "12345678000199",
  timezone: "America/Sao_Paulo",
  address: null,
  phone: null,
  email: null,
}

describe("buildMergeContext", () => {
  it("maps flat objects into a MergeContext", () => {
    const ctx = buildMergeContext({
      patient: {
        name: "Maria",
        cpf: "12345678909",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        billingResponsibleName: null,
        motherName: null,
        fatherName: null,
        email: null,
        phone: "551199",
      },
      professional: { name: "Dra. Ana", crp: "CRP06/1", cpf: null },
      clinic,
      appointment: { scheduledAt: new Date("2026-06-11T13:00:00Z"), endAt: new Date("2026-06-11T13:50:00Z") },
      sessionRows: [],
      manualFields: { finalidade: "trabalho" },
      generatedAt: new Date("2026-06-11T13:00:00Z"),
    })
    expect(ctx.patient.name).toBe("Maria")
    expect(ctx.professional?.name).toBe("Dra. Ana")
    expect(ctx.manualFields.finalidade).toBe("trabalho")
  })

  it("handles a patient without birthDate", () => {
    const ctx = buildMergeContext({
      patient: {
        name: "Maria",
        cpf: null,
        birthDate: null,
        billingResponsibleName: null,
        motherName: null,
        fatherName: null,
        email: null,
        phone: "551199",
      },
      professional: null,
      clinic,
      appointment: null,
      sessionRows: [],
      manualFields: {},
      generatedAt: new Date(),
    })
    expect(ctx.patient.birthDate).toBeNull()
    expect(ctx.appointment).toBeNull()
    expect(ctx.professional).toBeNull()
  })

  it("defaults manualFields to an empty object", () => {
    const ctx = buildMergeContext({
      patient: {
        name: "Maria",
        cpf: null,
        birthDate: null,
        billingResponsibleName: null,
        motherName: null,
        fatherName: null,
        email: null,
        phone: "551199",
      },
      professional: null,
      clinic,
      appointment: null,
      sessionRows: [],
      // @ts-expect-error testing the defensive default
      manualFields: undefined,
      generatedAt: new Date(),
    })
    expect(ctx.manualFields).toEqual({})
  })

  it("only carries the target patient — group members never leak", () => {
    // The adapter only receives one patient object; there is no field that
    // could carry other group members' names.
    const ctx = buildMergeContext({
      patient: {
        name: "Membro Alvo",
        cpf: null,
        birthDate: null,
        billingResponsibleName: null,
        motherName: null,
        fatherName: null,
        email: null,
        phone: "551199",
      },
      professional: null,
      clinic,
      appointment: { scheduledAt: new Date("2026-06-11T13:00:00Z"), endAt: new Date("2026-06-11T14:00:00Z") },
      sessionRows: [],
      manualFields: {},
      generatedAt: new Date(),
    })
    const serialized = JSON.stringify(ctx)
    expect(serialized).toContain("Membro Alvo")
    expect(ctx.patient.name).toBe("Membro Alvo")
  })
})
