import { describe, it, expect } from "vitest"
import { toPortalAppointment, toPortalInvoice, toPortalPatient } from "./serialize"

describe("toPortalAppointment", () => {
  it("maps the minimal fields and never leaks clinical content or price", () => {
    const result = toPortalAppointment({
      id: "appt1",
      scheduledAt: new Date("2026-06-11T15:00:00Z"),
      endAt: new Date("2026-06-11T15:50:00Z"),
      status: "AGENDADO",
      modality: "ONLINE",
      professionalProfile: { user: { name: "Dra. Maria" } },
      // extra fields that must NOT appear in output:
      ...({ notes: "segredo clínico", price: 350 } as Record<string, unknown>),
    } as never)

    expect(Object.keys(result).sort()).toEqual(
      ["endAt", "id", "modality", "professionalName", "scheduledAt", "status"].sort(),
    )
    expect(result).not.toHaveProperty("notes")
    expect(result).not.toHaveProperty("price")
    expect(result.professionalName).toBe("Dra. Maria")
  })
})

describe("toPortalInvoice", () => {
  const base = {
    id: "inv1",
    referenceMonth: 6,
    referenceYear: 2026,
    totalAmount: 350.5,
    dueDate: new Date("2026-06-15T00:00:00Z"),
    status: "PENDENTE",
    paidAt: null,
  }

  it("computes hasNfse=false without an EMITIDA emission", () => {
    expect(toPortalInvoice({ ...base, nfseEmissions: [] }).hasNfse).toBe(false)
    expect(
      toPortalInvoice({ ...base, nfseEmissions: [{ status: "PENDENTE", xml: null }] }).hasNfse,
    ).toBe(false)
  })

  it("computes hasNfse=true only when EMITIDA with xml", () => {
    expect(
      toPortalInvoice({ ...base, nfseEmissions: [{ status: "EMITIDA", xml: "<nfse/>" }] }).hasNfse,
    ).toBe(true)
    // EMITIDA without xml is not downloadable
    expect(
      toPortalInvoice({ ...base, nfseEmissions: [{ status: "EMITIDA", xml: null }] }).hasNfse,
    ).toBe(false)
  })

  it("converts Decimal-like totalAmount to a number", () => {
    const result = toPortalInvoice({ ...base, totalAmount: { toString: () => "120.00" } })
    expect(result.totalAmount).toBe(120)
  })

  it("maps paidAt when present", () => {
    const result = toPortalInvoice({ ...base, paidAt: new Date("2026-06-10T00:00:00Z") })
    expect(result.paidAt).toBe("2026-06-10T00:00:00.000Z")
  })
})

describe("toPortalPatient", () => {
  const now = new Date("2026-06-11T12:00:00Z")

  it("omits CPF, notes, therapeuticProject and other sensitive fields", () => {
    const result = toPortalPatient(
      {
        id: "p1",
        name: "Carlos",
        birthDate: new Date("1990-01-01"),
        phone: "11999999999",
        email: "carlos@example.com",
        addressStreet: "Rua A",
        addressNumber: "100",
        addressNeighborhood: "Centro",
        addressCity: "São Paulo",
        addressState: "SP",
        addressZip: "01000000",
        consentWhatsApp: true,
        consentEmail: false,
        // fields that must NOT appear:
        ...({ cpf: "12345678900", notes: "obs", therapeuticProject: "projeto", sessionFee: 300 } as Record<
          string,
          unknown
        >),
      } as never,
      now,
    )

    expect(result).not.toHaveProperty("cpf")
    expect(result).not.toHaveProperty("notes")
    expect(result).not.toHaveProperty("therapeuticProject")
    expect(result).not.toHaveProperty("sessionFee")
    expect(result.displayName).toBe("Carlos")
  })

  it("uses guardian framing for minors", () => {
    const result = toPortalPatient(
      {
        id: "p2",
        name: "Ana",
        birthDate: new Date("2020-01-01"),
        phone: "11988888888",
        email: null,
        addressStreet: null,
        addressNumber: null,
        addressNeighborhood: null,
        addressCity: null,
        addressState: null,
        addressZip: null,
        consentWhatsApp: false,
        consentEmail: false,
      },
      now,
    )
    expect(result.displayName).toBe("Responsável por Ana")
  })
})
