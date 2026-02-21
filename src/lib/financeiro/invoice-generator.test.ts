import { describe, it, expect } from "vitest"
import {
  classifyAppointments,
  buildInvoiceItems,
  calculateInvoiceTotals,
  type AppointmentForInvoice,
  type CreditForInvoice,
} from "./invoice-generator"

const makeAppointment = (overrides: Partial<AppointmentForInvoice> = {}): AppointmentForInvoice => ({
  id: "apt-1",
  scheduledAt: new Date("2026-03-05T10:00:00"),
  status: "FINALIZADO",
  type: "CONSULTA",
  recurrenceId: "rec-1",
  groupId: null,
  price: null,
  ...overrides,
})

describe("classifyAppointments", () => {
  it("classifies recurrence appointment as regular", () => {
    const result = classifyAppointments([makeAppointment({ recurrenceId: "rec-1", groupId: null })])
    expect(result.regular).toHaveLength(1)
    expect(result.extra).toHaveLength(0)
    expect(result.group).toHaveLength(0)
    expect(result.schoolMeeting).toHaveLength(0)
  })

  it("classifies non-recurrence CONSULTA as extra", () => {
    const result = classifyAppointments([makeAppointment({ recurrenceId: null, groupId: null, type: "CONSULTA" })])
    expect(result.regular).toHaveLength(0)
    expect(result.extra).toHaveLength(1)
  })

  it("classifies group appointment as group", () => {
    const result = classifyAppointments([makeAppointment({ groupId: "grp-1", recurrenceId: null })])
    expect(result.group).toHaveLength(1)
  })

  it("classifies REUNIAO as school meeting", () => {
    const result = classifyAppointments([makeAppointment({ type: "REUNIAO", recurrenceId: null, groupId: null })])
    expect(result.schoolMeeting).toHaveLength(1)
  })

  it("excludes cancelled appointments", () => {
    const result = classifyAppointments([
      makeAppointment({ id: "a1", status: "CANCELADO_FALTA" }),
      makeAppointment({ id: "a2", status: "CANCELADO_ACORDADO" }),
      makeAppointment({ id: "a3", status: "CANCELADO_PROFISSIONAL" }),
    ])
    expect(result.regular).toHaveLength(0)
    expect(result.extra).toHaveLength(0)
  })

  it("includes AGENDADO, CONFIRMADO, FINALIZADO", () => {
    const apts = [
      makeAppointment({ id: "a1", status: "AGENDADO" }),
      makeAppointment({ id: "a2", status: "CONFIRMADO" }),
      makeAppointment({ id: "a3", status: "FINALIZADO" }),
    ]
    const result = classifyAppointments(apts)
    expect(result.regular).toHaveLength(3)
  })
})

describe("buildInvoiceItems", () => {
  const sessionFee = 150

  it("creates one item per regular session", () => {
    const classified = { regular: [makeAppointment()], extra: [], group: [], schoolMeeting: [] }
    const items = buildInvoiceItems(classified, sessionFee, [], true)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("SESSAO_REGULAR")
    expect(items[0].unitPrice).toBe(150)
    expect(items[0].total).toBe(150)
  })

  it("uses appointment price when available instead of sessionFee", () => {
    const classified = { regular: [makeAppointment({ price: 200 })], extra: [], group: [], schoolMeeting: [] }
    const items = buildInvoiceItems(classified, sessionFee, [], false)
    expect(items[0].unitPrice).toBe(200)
  })

  it("includes appointment date in description when showDays is true", () => {
    const classified = { regular: [makeAppointment({ scheduledAt: new Date("2026-03-05T10:00:00") })], extra: [], group: [], schoolMeeting: [] }
    const items = buildInvoiceItems(classified, sessionFee, [], true)
    expect(items[0].description).toContain("05/03")
  })

  it("does not include date when showDays is false", () => {
    const classified = { regular: [makeAppointment({ scheduledAt: new Date("2026-03-05T10:00:00") })], extra: [], group: [], schoolMeeting: [] }
    const items = buildInvoiceItems(classified, sessionFee, [], false)
    expect(items[0].description).not.toContain("05/03")
  })

  it("adds credit items as negative values", () => {
    const credits: CreditForInvoice[] = [
      { id: "cred-1", reason: "Cancelamento acordado - 28/02/2026", createdAt: new Date("2026-02-28") },
    ]
    const classified = { regular: [makeAppointment()], extra: [], group: [], schoolMeeting: [] }
    const items = buildInvoiceItems(classified, sessionFee, credits, false)
    const creditItem = items.find(i => i.type === "CREDITO")
    expect(creditItem).toBeDefined()
    expect(creditItem!.total).toBe(-150)
    expect(creditItem!.unitPrice).toBe(150)
    expect(creditItem!.quantity).toBe(-1)
  })

  it("creates correct types for extras, groups, and school meetings", () => {
    const classified = {
      regular: [],
      extra: [makeAppointment({ id: "e1", recurrenceId: null, type: "CONSULTA" })],
      group: [makeAppointment({ id: "g1", groupId: "grp-1" })],
      schoolMeeting: [makeAppointment({ id: "s1", type: "REUNIAO" })],
    }
    const items = buildInvoiceItems(classified, sessionFee, [], false)
    expect(items.map(i => i.type)).toEqual(["SESSAO_EXTRA", "SESSAO_GRUPO", "REUNIAO_ESCOLA"])
  })
})

describe("calculateInvoiceTotals", () => {
  it("calculates totals from items", () => {
    const items = [
      { type: "SESSAO_REGULAR" as const, total: 150, quantity: 1 },
      { type: "SESSAO_REGULAR" as const, total: 150, quantity: 1 },
      { type: "SESSAO_EXTRA" as const, total: 150, quantity: 1 },
      { type: "CREDITO" as const, total: -150, quantity: -1 },
    ]
    const totals = calculateInvoiceTotals(items)
    expect(totals.totalSessions).toBe(3)
    expect(totals.creditsApplied).toBe(1)
    expect(totals.extrasAdded).toBe(1)
    expect(totals.totalAmount).toBe(300)
  })

  it("handles zero items", () => {
    const totals = calculateInvoiceTotals([])
    expect(totals.totalSessions).toBe(0)
    expect(totals.creditsApplied).toBe(0)
    expect(totals.extrasAdded).toBe(0)
    expect(totals.totalAmount).toBe(0)
  })

  it("counts group sessions and school meetings in totalSessions", () => {
    const items = [
      { type: "SESSAO_GRUPO" as const, total: 150, quantity: 1 },
      { type: "REUNIAO_ESCOLA" as const, total: 150, quantity: 1 },
    ]
    const totals = calculateInvoiceTotals(items)
    expect(totals.totalSessions).toBe(2)
    expect(totals.totalAmount).toBe(300)
  })
})
