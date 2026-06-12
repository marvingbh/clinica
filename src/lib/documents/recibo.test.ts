import { describe, it, expect } from "vitest"
import { buildReciboSessionRows, sumSessionRows, type PaidItemInput } from "./recibo"

const TZ = "America/Sao_Paulo"

function item(overrides: Partial<PaidItemInput>): PaidItemInput {
  return {
    id: "i1",
    description: "Sessão",
    total: 200,
    appointmentScheduledAt: new Date("2026-06-11T13:00:00Z"),
    appointmentEndAt: new Date("2026-06-11T13:50:00Z"),
    invoiceStatus: "PAGO",
    type: "SESSAO_REGULAR",
    ...overrides,
  }
}

describe("buildReciboSessionRows", () => {
  it("includes only PAGO invoices with eligible session types", () => {
    const rows = buildReciboSessionRows(
      [
        item({ id: "a", invoiceStatus: "PAGO", type: "SESSAO_REGULAR" }),
        item({ id: "b", invoiceStatus: "PENDENTE", type: "SESSAO_REGULAR" }),
        item({ id: "c", invoiceStatus: "PAGO", type: "SESSAO_EXTRA" }),
        item({ id: "d", invoiceStatus: "PAGO", type: "SESSAO_GRUPO" }),
        item({ id: "e", invoiceStatus: "PAGO", type: "CREDITO" }),
        item({ id: "f", invoiceStatus: "PAGO", type: "REUNIAO_ESCOLA" }),
      ],
      TZ,
      50
    )
    expect(rows.map((r) => r.invoiceItemId).sort()).toEqual(["a", "c", "d"])
  })

  it("never includes CREDITO items", () => {
    const rows = buildReciboSessionRows([item({ id: "x", type: "CREDITO" })], TZ, 50)
    expect(rows).toEqual([])
  })

  it("orders rows by appointment date", () => {
    const rows = buildReciboSessionRows(
      [
        item({ id: "later", appointmentScheduledAt: new Date("2026-06-20T13:00:00Z"), appointmentEndAt: new Date("2026-06-20T13:50:00Z") }),
        item({ id: "earlier", appointmentScheduledAt: new Date("2026-06-01T13:00:00Z"), appointmentEndAt: new Date("2026-06-01T13:50:00Z") }),
      ],
      TZ,
      50
    )
    expect(rows.map((r) => r.invoiceItemId)).toEqual(["earlier", "later"])
  })

  it("derives duration from endAt - scheduledAt", () => {
    const rows = buildReciboSessionRows(
      [item({ appointmentScheduledAt: new Date("2026-06-11T13:00:00Z"), appointmentEndAt: new Date("2026-06-11T14:00:00Z") })],
      TZ,
      50
    )
    expect(rows[0].durationMinutes).toBe(60)
  })

  it("falls back to defaultDuration when appointment times are missing", () => {
    const rows = buildReciboSessionRows(
      [item({ appointmentScheduledAt: null, appointmentEndAt: null })],
      TZ,
      45
    )
    expect(rows[0].durationMinutes).toBe(45)
    expect(rows[0].date).toBe("—")
  })

  it("formats the unit price as BRL", () => {
    const rows = buildReciboSessionRows([item({ total: 200 })], TZ, 50)
    expect(rows[0].unitPrice).toBe("R$ 200,00")
  })
})

describe("sumSessionRows", () => {
  it("sums values with centavos", () => {
    const total = sumSessionRows([
      { date: "01/06", durationMinutes: 50, unitPrice: "R$ 1.000,06", invoiceItemId: "a" },
      { date: "08/06", durationMinutes: 50, unitPrice: "R$ 234,50", invoiceItemId: "b" },
    ])
    expect(total).toBe("R$ 1.234,56")
  })

  it("returns R$ 0,00 for an empty list", () => {
    expect(sumSessionRows([])).toBe("R$ 0,00")
  })
})
