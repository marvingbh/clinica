import { describe, it, expect } from "vitest"
import { buildInvoicePDFData, type InvoiceWithRelations } from "./build-invoice-pdf-data"

const baseClinic = {
  name: "Clínica X",
  phone: null,
  email: null,
  address: null,
  paymentInfo: null,
  logoData: null,
  logoMime: null,
}

function makeInvoice(items: InvoiceWithRelations["items"], extras: Partial<InvoiceWithRelations> = {}): InvoiceWithRelations {
  return {
    referenceMonth: 5,
    referenceYear: 2026,
    status: "PENDENTE",
    totalSessions: items.filter(i => i.type !== "CREDITO").length,
    creditsApplied: items.filter(i => i.type === "CREDITO").length,
    totalAmount: items.reduce((s, i) => s + Number(i.total), 0),
    dueDate: new Date("2026-05-15T12:00:00.000Z"),
    clinic: baseClinic,
    patient: { name: "Felipe Lopes" },
    professionalProfile: { user: { name: "Elena Sabino" } },
    items,
    ...extras,
  }
}

function makeItem(overrides: Partial<InvoiceWithRelations["items"][number]>): InvoiceWithRelations["items"][number] {
  return {
    description: "Psicoterapia individual",
    quantity: 1,
    unitPrice: 240,
    total: 240,
    type: "SESSAO_REGULAR",
    appointmentId: "a1",
    attendingProfessionalId: "p1",
    appointment: { scheduledAt: new Date("2026-05-02T13:00:00.000Z") },
    attendingProfessional: { user: { name: "Elena" } },
    ...overrides,
  }
}

describe("buildInvoicePDFData", () => {
  it("returns a single section with no header for single-attending invoices", () => {
    const data = buildInvoicePDFData(makeInvoice([
      makeItem({ appointmentId: "a1" }),
      makeItem({ appointmentId: "a2", appointment: { scheduledAt: new Date("2026-05-09T13:00:00Z") } }),
    ]))

    expect(data.itemSections).toHaveLength(1)
    expect(data.itemSections[0].header).toBeNull()
    expect(data.itemSections[0].items.map(i => i.description)).toEqual([
      "Psicoterapia individual",
      "Psicoterapia individual",
    ])
  })

  it("emits a 'Técnico de referência' header line when the patient has one", () => {
    const data = buildInvoicePDFData(makeInvoice(
      [makeItem({})],
      { patient: { name: "Felipe", referenceProfessional: { user: { name: "Elena Sabino" } } } },
    ))

    expect(data.referenceProfessionalLabel).toBe("Técnico de referência")
    expect(data.referenceProfessionalName).toBe("Elena Sabino")
  })

  it("falls back to 'Profissional: <attending>' when patient has no reference", () => {
    const data = buildInvoicePDFData(makeInvoice([makeItem({})]))
    expect(data.referenceProfessionalLabel).toBe("Profissional")
    expect(data.referenceProfessionalName).toBe("Elena")
  })

  it("omits the header pair when patient has no reference and 2+ professionals attend", () => {
    const data = buildInvoicePDFData(makeInvoice([
      makeItem({ appointmentId: "a1", attendingProfessionalId: "p1", attendingProfessional: { user: { name: "Elena" } } }),
      makeItem({ appointmentId: "a2", attendingProfessionalId: "p2", attendingProfessional: { user: { name: "Cherlen" } } }),
    ]))
    expect(data.referenceProfessionalLabel).toBeNull()
    expect(data.referenceProfessionalName).toBeNull()
  })

  it("splits items into sections per professional when 2+ attend, sorted by date", () => {
    const data = buildInvoicePDFData(makeInvoice([
      makeItem({
        appointmentId: "a1",
        attendingProfessionalId: "p1",
        attendingProfessional: { user: { name: "Elena" } },
        appointment: { scheduledAt: new Date("2026-05-02T13:00:00Z") },
      }),
      makeItem({
        appointmentId: "a2",
        type: "SESSAO_GRUPO",
        description: "Psicoterapia em grupo",
        attendingProfessionalId: "p2",
        attendingProfessional: { user: { name: "Cherlen" } },
        appointment: {
          scheduledAt: new Date("2026-05-10T13:00:00Z"),
          group: { name: "Keep Lua" },
        },
      }),
      makeItem({
        appointmentId: "a3",
        attendingProfessionalId: "p1",
        attendingProfessional: { user: { name: "Elena" } },
        appointment: { scheduledAt: new Date("2026-05-09T13:00:00Z") },
      }),
    ]))

    expect(data.itemSections.map(s => s.header)).toEqual([
      "Atendido por Elena",
      "Atendido por Cherlen",
    ])
    expect(data.itemSections[0].items.map(i => i.date)).toEqual(["02/05", "09/05"])
    expect(data.itemSections[1].items[0].description).toBe("Psicoterapia em grupo — Keep Lua")
  })

  it("sends manual rows (no appointment) to a trailing 'Outros' section in multi mode", () => {
    const data = buildInvoicePDFData(makeInvoice([
      makeItem({ attendingProfessionalId: "p1", attendingProfessional: { user: { name: "Elena" } } }),
      makeItem({
        appointmentId: "a2",
        attendingProfessionalId: "p2",
        attendingProfessional: { user: { name: "Cherlen" } },
        appointment: { scheduledAt: new Date("2026-05-09T13:00:00Z") },
      }),
      makeItem({
        appointmentId: null,
        attendingProfessionalId: null,
        attendingProfessional: null,
        type: "SESSAO_EXTRA",
        description: "Manual extra",
        appointment: null,
      }),
    ]))

    const headers = data.itemSections.map(s => s.header)
    expect(headers).toEqual(["Atendido por Elena", "Atendido por Cherlen", "Outros"])
    const others = data.itemSections.find(s => s.header === "Outros")!
    expect(others.items.map(i => i.description)).toEqual(["Manual extra"])
  })

  it("places CREDITO items in a trailing 'Créditos' section in multi mode", () => {
    const data = buildInvoicePDFData(makeInvoice([
      makeItem({ attendingProfessionalId: "p1", attendingProfessional: { user: { name: "Elena" } } }),
      makeItem({
        appointmentId: "a2",
        attendingProfessionalId: "p2",
        attendingProfessional: { user: { name: "Cherlen" } },
        appointment: { scheduledAt: new Date("2026-05-09T13:00:00Z") },
      }),
      makeItem({
        appointmentId: null,
        attendingProfessionalId: null,
        attendingProfessional: null,
        type: "CREDITO",
        description: "Crédito: Desmarcou",
        total: -240,
        unitPrice: 240,
        quantity: -1,
        appointment: null,
      }),
    ]))

    const last = data.itemSections.at(-1)!
    expect(last.header).toBe("Créditos")
    expect(last.items[0].description).toBe("Crédito: Desmarcou")
  })
})
