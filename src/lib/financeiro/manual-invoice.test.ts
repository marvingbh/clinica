import { describe, it, expect } from "vitest"
import {
  validateManualInvoiceInput,
  buildManualInvoiceItems,
  resolveInvoiceReference,
} from "./manual-invoice"

const makeAppointment = (overrides = {}) => ({
  id: "apt-1",
  scheduledAt: new Date("2026-03-05T10:00:00"),
  status: "FINALIZADO",
  type: "CONSULTA",
  title: null,
  price: null as number | null,
  patientId: "pat-1",
  clinicId: "clinic-1",
  ...overrides,
})

describe("validateManualInvoiceInput", () => {
  it("rejects empty appointments array", () => {
    const result = validateManualInvoiceInput({
      appointments: [],
      patientId: "pat-1",
      clinicId: "clinic-1",
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain("appointment")
  })

  it("rejects when an appointment belongs to different patient", () => {
    const result = validateManualInvoiceInput({
      appointments: [
        makeAppointment({ id: "a1", patientId: "pat-1" }),
        makeAppointment({ id: "a2", patientId: "pat-2" }),
      ],
      patientId: "pat-1",
      clinicId: "clinic-1",
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain("paciente")
  })

  it("rejects when an appointment belongs to different clinic", () => {
    const result = validateManualInvoiceInput({
      appointments: [
        makeAppointment({ id: "a1", clinicId: "clinic-2" }),
      ],
      patientId: "pat-1",
      clinicId: "clinic-1",
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain("clínica")
  })

  it("accepts valid input", () => {
    const result = validateManualInvoiceInput({
      appointments: [
        makeAppointment({ id: "a1" }),
        makeAppointment({ id: "a2" }),
      ],
      patientId: "pat-1",
      clinicId: "clinic-1",
    })
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

describe("buildManualInvoiceItems", () => {
  const sessionFee = 150

  it("creates one item per appointment", () => {
    const appointments = [
      makeAppointment({ id: "a1" }),
      makeAppointment({ id: "a2" }),
    ]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items).toHaveLength(2)
  })

  it("uses appointment price when available", () => {
    const appointments = [makeAppointment({ id: "a1", price: 200 })]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items[0].unitPrice).toBe(200)
    expect(items[0].total).toBe(200)
  })

  it("falls back to sessionFee when appointment price is null", () => {
    const appointments = [makeAppointment({ id: "a1", price: null })]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items[0].unitPrice).toBe(sessionFee)
  })

  it("falls back to sessionFee when appointment price is 0", () => {
    const appointments = [makeAppointment({ id: "a1", price: 0 })]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items[0].unitPrice).toBe(sessionFee)
  })

  it("includes date in description", () => {
    const appointments = [makeAppointment({ scheduledAt: new Date("2026-03-05T10:00:00") })]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items[0].description).toContain("05/03")
  })

  it("sets correct type based on appointment type", () => {
    const appointments = [
      makeAppointment({ id: "a1", type: "CONSULTA" }),
      makeAppointment({ id: "a2", type: "REUNIAO", title: "Escola ABC" }),
    ]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items[0].type).toBe("SESSAO_REGULAR")
    expect(items[1].type).toBe("REUNIAO_ESCOLA")
  })

  it("links items to appointment IDs", () => {
    const appointments = [makeAppointment({ id: "apt-xyz" })]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items[0].appointmentId).toBe("apt-xyz")
  })

  it("uses REUNIAO title in description", () => {
    const appointments = [makeAppointment({ type: "REUNIAO", title: "Reunião escola ABC" })]
    const items = buildManualInvoiceItems(appointments, sessionFee)
    expect(items[0].description).toContain("Reunião escola ABC")
  })
})

describe("resolveInvoiceReference", () => {
  it("defaults to the current month/year when not supplied", () => {
    const now = new Date("2026-06-16T12:00:00")
    expect(resolveInvoiceReference(now)).toEqual({ referenceMonth: 6, referenceYear: 2026 })
  })

  it("uses the current month even when billing a past-month session", () => {
    // Session was in May, but the invoice is created in June -> references June.
    const now = new Date("2026-06-16T12:00:00")
    expect(resolveInvoiceReference(now)).toEqual({ referenceMonth: 6, referenceYear: 2026 })
  })

  it("honors an explicit referenceMonth/referenceYear", () => {
    const now = new Date("2026-06-16T12:00:00")
    expect(resolveInvoiceReference(now, 4, 2025)).toEqual({ referenceMonth: 4, referenceYear: 2025 })
  })

  it("falls back to current year when only month is supplied", () => {
    const now = new Date("2026-06-16T12:00:00")
    expect(resolveInvoiceReference(now, 3)).toEqual({ referenceMonth: 3, referenceYear: 2026 })
  })
})
