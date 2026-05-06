import { describe, it, expect } from "vitest"
import {
  isoToBrDate,
  brDateToIso,
  defaultPatientFormValues,
  patientToFormData,
  intakeSubmissionToFormData,
  buildPatientPayload,
} from "./form-mappers"

describe("isoToBrDate", () => {
  it("converts an ISO date to DD/MM/YYYY", () => {
    expect(isoToBrDate("2026-05-06")).toBe("06/05/2026")
  })

  it("converts a Date to DD/MM/YYYY using UTC components", () => {
    expect(isoToBrDate(new Date("2026-05-06T12:00:00Z"))).toBe("06/05/2026")
  })

  it("returns empty string for null/undefined", () => {
    expect(isoToBrDate(null)).toBe("")
    expect(isoToBrDate(undefined)).toBe("")
  })

  it("returns empty string for invalid dates", () => {
    expect(isoToBrDate("not-a-date")).toBe("")
  })
})

describe("brDateToIso", () => {
  it("converts DD/MM/YYYY to YYYY-MM-DD", () => {
    expect(brDateToIso("06/05/2026")).toBe("2026-05-06")
  })

  it("zero-pads single-digit day/month inputs", () => {
    expect(brDateToIso("6/5/2026")).toBe("2026-05-06")
  })

  it("returns empty string for malformed input", () => {
    expect(brDateToIso("06-05-2026")).toBe("")
    expect(brDateToIso("")).toBe("")
  })
})

describe("defaultPatientFormValues", () => {
  it("returns all fields with empty/false defaults", () => {
    const v = defaultPatientFormValues()
    expect(v.name).toBe("")
    expect(v.phone).toBe("")
    expect(v.consentWhatsApp).toBe(false)
    expect(v.consentEmail).toBe(false)
    expect(v.nfsePerAppointment).toBe(false)
    expect(v.splitInvoiceByProfessional).toBe(false)
    expect(v.sessionFee).toBe("")
    expect(v.invoiceDueDay).toBe("")
  })
})

describe("patientToFormData", () => {
  const basePatient = {
    name: "João",
    phone: "5531999990000",
    email: "joao@example.com",
    birthDate: "2010-03-15",
    cpf: "12345678901",
    billingCpf: null,
    billingResponsibleName: null,
    nfseDescriptionTemplate: null,
    nfsePerAppointment: true,
    splitInvoiceByProfessional: false,
    nfseObs: null,
    addressStreet: null,
    addressNumber: null,
    addressNeighborhood: null,
    addressCity: null,
    addressState: null,
    addressZip: null,
    fatherName: null,
    motherName: null,
    schoolName: null,
    firstAppointmentDate: null,
    sessionFee: 250,
    invoiceDueDay: 10,
    invoiceGrouping: "MONTHLY",
    lastFeeAdjustmentDate: null,
    therapeuticProject: null,
    notes: null,
    referenceProfessionalId: "prof-1",
    consentWhatsApp: true,
    consentEmail: false,
  }

  it("converts numeric sessionFee to a string for the form input", () => {
    expect(patientToFormData(basePatient).sessionFee).toBe("250")
  })

  it("converts ISO birthDate to DD/MM/YYYY", () => {
    expect(patientToFormData(basePatient).birthDate).toBe("15/03/2010")
  })

  it("nullable strings become empty strings", () => {
    const v = patientToFormData(basePatient)
    expect(v.email).toBe("joao@example.com")
    expect(v.cpf).toBe("12345678901")
    expect(v.fatherName).toBe("")
    expect(v.motherName).toBe("")
  })

  it("preserves consent booleans", () => {
    const v = patientToFormData(basePatient)
    expect(v.consentWhatsApp).toBe(true)
    expect(v.consentEmail).toBe(false)
  })
})

describe("intakeSubmissionToFormData", () => {
  const submission = {
    childName: "Pedro Silva",
    childBirthDate: "2018-08-12",
    guardianName: "Maria Silva",
    guardianCpfCnpj: "98765432100",
    phone: "5531999990000",
    email: "maria@example.com",
    addressStreet: "Rua A",
    addressNumber: "100",
    addressNeighborhood: "Centro",
    addressCity: "BH",
    addressState: "MG",
    addressZip: "30000000",
    schoolName: "Escola Y",
    fatherName: null,
    motherName: "Maria Silva",
  }

  it("maps childName → name, childBirthDate → BR date in birthDate", () => {
    const v = intakeSubmissionToFormData(submission)
    expect(v.name).toBe("Pedro Silva")
    expect(v.birthDate).toBe("12/08/2018")
  })

  it("maps guardianCpfCnpj → billingCpf and guardianName → billingResponsibleName, NOT to patient cpf/name", () => {
    const v = intakeSubmissionToFormData(submission)
    expect(v.billingCpf).toBe("98765432100")
    expect(v.billingResponsibleName).toBe("Maria Silva")
    expect(v.cpf).toBe("") // patient's own CPF stays blank for the operator
  })

  it("leaves admin-only fields blank for the operator to fill in", () => {
    const v = intakeSubmissionToFormData(submission)
    expect(v.sessionFee).toBe("")
    expect(v.referenceProfessionalId).toBe("")
    expect(v.therapeuticProject).toBe("")
    expect(v.consentWhatsApp).toBe(false) // not captured on intake form
    expect(v.consentEmail).toBe(false)
  })

  it("nullable submission fields become empty strings", () => {
    const v = intakeSubmissionToFormData({ ...submission, fatherName: null, addressStreet: null })
    expect(v.fatherName).toBe("")
    expect(v.addressStreet).toBe("")
  })
})

describe("buildPatientPayload", () => {
  const formData = {
    ...defaultPatientFormValues(),
    name: "João",
    phone: "+5531999990000",
    email: "joao@example.com",
    birthDate: "15/03/2010",
    sessionFee: "250.50",
    invoiceDueDay: "10",
    invoiceGrouping: "MONTHLY",
    consentWhatsApp: true,
    consentEmail: false,
  }

  it("normalizes phone to digits-only", () => {
    const p = buildPatientPayload({ data: formData, additionalPhones: [] })
    expect(p.phone).toBe("5531999990000")
  })

  it("converts BR birthDate to ISO", () => {
    const p = buildPatientPayload({ data: formData, additionalPhones: [] })
    expect(p.birthDate).toBe("2010-03-15")
  })

  it("parses sessionFee as float and invoiceDueDay as int", () => {
    const p = buildPatientPayload({ data: formData, additionalPhones: [] })
    expect(p.sessionFee).toBe(250.5)
    expect(p.invoiceDueDay).toBe(10)
  })

  it("nulls empty optional fields rather than sending blank strings", () => {
    const p = buildPatientPayload({ data: formData, additionalPhones: [] })
    expect(p.cpf).toBeNull()
    expect(p.therapeuticProject).toBeNull()
  })

  it("filters out additionalPhones with empty phone or label", () => {
    const p = buildPatientPayload({
      data: formData,
      additionalPhones: [
        { id: "a", phone: "5531888880000", label: "Mãe" },
        { phone: "  ", label: "Pai" },
        { phone: "5531777770000", label: "" },
      ],
    })
    expect(p.additionalPhones).toEqual([
      { id: "a", phone: "5531888880000", label: "Mãe" },
    ])
  })

  it("strips non-digits from additionalPhone numbers", () => {
    const p = buildPatientPayload({
      data: formData,
      additionalPhones: [{ phone: "+55 (31) 88888-0000", label: "Mãe" }],
    })
    expect((p.additionalPhones as { phone: string }[])[0].phone).toBe("5531888880000")
  })

  it("forwards consent flags as-is", () => {
    const p = buildPatientPayload({ data: formData, additionalPhones: [] })
    expect(p.consentWhatsApp).toBe(true)
    expect(p.consentEmail).toBe(false)
  })
})
