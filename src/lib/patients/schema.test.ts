import { describe, it, expect } from "vitest"
import {
  additionalPhoneSchema,
  patientFormSchema,
  patientApiSchema,
  phoneRegex,
} from "./schema"

describe("phoneRegex", () => {
  it("accepts a digit-only phone with +55", () => {
    expect(phoneRegex.test("+5531999990000")).toBe(true)
  })

  it("accepts a digit-only phone without country code", () => {
    expect(phoneRegex.test("31999990000")).toBe(true)
  })

  it("rejects phones with separators", () => {
    expect(phoneRegex.test("(31) 99999-0000")).toBe(false)
  })

  it("rejects too-short phones", () => {
    expect(phoneRegex.test("3199990")).toBe(false)
  })
})

describe("additionalPhoneSchema", () => {
  it("accepts a valid additional phone", () => {
    const result = additionalPhoneSchema.safeParse({
      phone: "5531999990000",
      label: "Mãe",
      notify: true,
    })
    expect(result.success).toBe(true)
  })

  it("defaults notify to true when omitted", () => {
    const result = additionalPhoneSchema.safeParse({
      phone: "5531999990000",
      label: "Mãe",
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.notify).toBe(true)
  })

  it("rejects label longer than 30 characters", () => {
    const result = additionalPhoneSchema.safeParse({
      phone: "5531999990000",
      label: "X".repeat(31),
      notify: true,
    })
    expect(result.success).toBe(false)
  })
})

describe("patientFormSchema (form-shape)", () => {
  it("accepts a minimal valid form payload", () => {
    const result = patientFormSchema.safeParse({
      name: "João",
      phone: "5531999990000",
      nfsePerAppointment: false,
      splitInvoiceByProfessional: false,
      consentWhatsApp: false,
      consentEmail: false,
      dunningOptOut: false,
    })
    expect(result.success).toBe(true)
  })

  it("treats sessionFee as a string (form input)", () => {
    const result = patientFormSchema.safeParse({
      name: "João",
      phone: "5531999990000",
      sessionFee: "250.00",
      nfsePerAppointment: false,
      splitInvoiceByProfessional: false,
      consentWhatsApp: false,
      consentEmail: false,
      dunningOptOut: false,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sessionFee).toBe("250.00")
  })

  it("rejects a name shorter than 2 characters", () => {
    const result = patientFormSchema.safeParse({
      name: "J",
      phone: "5531999990000",
      nfsePerAppointment: false,
      splitInvoiceByProfessional: false,
      consentWhatsApp: false,
      consentEmail: false,
    })
    expect(result.success).toBe(false)
  })

  it("requires the boolean toggles (no defaults on the form path)", () => {
    const result = patientFormSchema.safeParse({
      name: "João",
      phone: "5531999990000",
    })
    expect(result.success).toBe(false)
  })
})

describe("patientApiSchema (API contract)", () => {
  it("accepts a minimal valid API payload", () => {
    const result = patientApiSchema.safeParse({
      name: "João",
      phone: "5531999990000",
    })
    expect(result.success).toBe(true)
  })

  it("treats sessionFee as a number (server-converted)", () => {
    const result = patientApiSchema.safeParse({
      name: "João",
      phone: "5531999990000",
      sessionFee: 250.5,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sessionFee).toBe(250.5)
  })

  it("rejects sessionFee as a string", () => {
    const result = patientApiSchema.safeParse({
      name: "João",
      phone: "5531999990000",
      sessionFee: "250",
    })
    expect(result.success).toBe(false)
  })

  it("defaults consent flags to false", () => {
    const result = patientApiSchema.safeParse({
      name: "João",
      phone: "5531999990000",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.consentWhatsApp).toBe(false)
      expect(result.data.consentEmail).toBe(false)
    }
  })

  it("rejects more than 4 additional phones", () => {
    const result = patientApiSchema.safeParse({
      name: "João",
      phone: "5531999990000",
      additionalPhones: Array.from({ length: 5 }, (_, i) => ({
        phone: `553199999000${i}`,
        label: `L${i}`,
        notify: true,
      })),
    })
    expect(result.success).toBe(false)
  })

  it("accepts invoiceGrouping enum values", () => {
    expect(
      patientApiSchema.safeParse({
        name: "XX",
        phone: "5531999990000",
        invoiceGrouping: "MONTHLY",
      }).success,
    ).toBe(true)
    expect(
      patientApiSchema.safeParse({
        name: "XX",
        phone: "5531999990000",
        invoiceGrouping: "PER_SESSION",
      }).success,
    ).toBe(true)
    expect(
      patientApiSchema.safeParse({
        name: "XX",
        phone: "5531999990000",
        invoiceGrouping: "OTHER",
      }).success,
    ).toBe(false)
  })
})
