import { describe, it, expect } from "vitest"
import { resolvePayer, buildReciboRows, isExportable } from "./recibo-validation"
import type { PatientFiscalData, PaymentEvent, ProfessionalFiscalData } from "./types"

const VALID_BENEF_CPF = "52998224725"
const VALID_PAYER_CPF = "39053344705"
const VALID_PROF_CPF = "11144477735"

function patient(overrides: Partial<PatientFiscalData> = {}): PatientFiscalData {
  return {
    id: "pat1",
    name: "Maria",
    cpf: VALID_BENEF_CPF,
    birthDate: new Date("2010-05-20"),
    billingCpf: null,
    billingResponsibleName: null,
    ...overrides,
  }
}

function professional(overrides: Partial<ProfessionalFiscalData> = {}): ProfessionalFiscalData {
  return {
    id: "prof1",
    name: "Dra. Ana",
    cpf: VALID_PROF_CPF,
    crp: "CRP06/12345",
    fiscalRegime: "PF",
    fiscalRegimeSince: null,
    ...overrides,
  }
}

function event(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    paymentKey: "recl:l1",
    invoiceId: "inv1",
    reconciliationLinkId: "l1",
    paymentDate: new Date("2025-02-05"),
    amount: 200,
    patientId: "pat1",
    professionalProfileId: "prof1",
    refundedAmount: 0,
    ...overrides,
  }
}

function build(ev: PaymentEvent, pat: PatientFiscalData, prof: ProfessionalFiscalData) {
  return buildReciboRows([ev], new Map([[pat.id, pat]]), new Map([[prof.id, prof]]))
}

describe("resolvePayer", () => {
  it("uses the financial responsible when billingCpf is present", () => {
    const party = resolvePayer(patient({ billingCpf: VALID_PAYER_CPF, billingResponsibleName: "João Pai" }))
    expect(party.cpf).toBe(VALID_PAYER_CPF)
    expect(party.name).toBe("João Pai")
  })

  it("falls back to the patient when billingCpf is absent", () => {
    const party = resolvePayer(patient())
    expect(party.cpf).toBe(VALID_BENEF_CPF)
    expect(party.name).toBe("Maria")
  })
})

describe("buildReciboRows blockers", () => {
  it("a fully valid row has no blockers and is exportable", () => {
    const [row] = build(event(), patient({ billingCpf: VALID_PAYER_CPF }), professional())
    expect(row.blockers).toEqual([])
    expect(isExportable(row)).toBe(true)
  })

  it("flags BENEFICIARIO_SEM_CPF when the patient pays for themselves and has no CPF", () => {
    const [row] = build(event(), patient({ cpf: null }), professional({}))
    expect(row.blockers).toContain("BENEFICIARIO_SEM_CPF")
  })

  it("does NOT require beneficiary CPF when a financial responsible (billingCpf) covers it (e.g. a minor)", () => {
    const [row] = build(
      event(),
      patient({ cpf: null, billingCpf: VALID_PAYER_CPF, billingResponsibleName: "João Pai" }),
      professional()
    )
    expect(row.blockers).not.toContain("BENEFICIARIO_SEM_CPF")
    expect(row.blockers).not.toContain("PAGADOR_SEM_CPF")
    expect(isExportable(row)).toBe(true)
  })

  it("flags BENEFICIARIO_SEM_NASCIMENTO", () => {
    const [row] = build(event(), patient({ birthDate: null }), professional())
    expect(row.blockers).toContain("BENEFICIARIO_SEM_NASCIMENTO")
  })

  it("flags PAGADOR_SEM_CPF when neither billing nor patient CPF is valid", () => {
    const [row] = build(event(), patient({ cpf: null, billingCpf: null }), professional())
    expect(row.blockers).toContain("PAGADOR_SEM_CPF")
  })

  it("flags PROFISSIONAL_SEM_CPF", () => {
    const [row] = build(event(), patient({ billingCpf: VALID_PAYER_CPF }), professional({ cpf: null }))
    expect(row.blockers).toContain("PROFISSIONAL_SEM_CPF")
  })

  it("flags PROFISSIONAL_SEM_CRP", () => {
    const [row] = build(event(), patient({ billingCpf: VALID_PAYER_CPF }), professional({ crp: null }))
    expect(row.blockers).toContain("PROFISSIONAL_SEM_CRP")
  })

  it("flags PAGAMENTO_SEM_DATA", () => {
    const [row] = build(event({ paymentDate: null }), patient({ billingCpf: VALID_PAYER_CPF }), professional())
    expect(row.blockers).toContain("PAGAMENTO_SEM_DATA")
  })

  it("flags VALOR_INVALIDO for non-positive amounts", () => {
    const [row] = build(event({ amount: 0 }), patient({ billingCpf: VALID_PAYER_CPF }), professional())
    expect(row.blockers).toContain("VALOR_INVALIDO")
  })
})

describe("refund flags", () => {
  it("sets refundWarning for a partial refund but keeps the row exportable", () => {
    // Partial refunds are flagged (not pre-selected) but may still be emitted
    // after the user reviews — only a FULL refund excludes the row from export.
    const [row] = build(event({ refundedAmount: 50 }), patient({ billingCpf: VALID_PAYER_CPF }), professional())
    expect(row.refundWarning).toBe(true)
    expect(row.fullyRefunded).toBe(false)
    expect(isExportable(row)).toBe(true)
  })

  it("sets fullyRefunded when the refund covers the amount", () => {
    const [row] = build(event({ refundedAmount: 200 }), patient({ billingCpf: VALID_PAYER_CPF }), professional())
    expect(row.fullyRefunded).toBe(true)
    expect(row.refundWarning).toBe(false)
    expect(isExportable(row)).toBe(false)
  })

  it("no refund flags when refundedAmount is zero", () => {
    const [row] = build(event(), patient({ billingCpf: VALID_PAYER_CPF }), professional())
    expect(row.refundWarning).toBe(false)
    expect(row.fullyRefunded).toBe(false)
  })
})
