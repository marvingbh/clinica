import { describe, it, expect } from "vitest"
import { todayInZone, dueDateWindow, toDunningInput, type DunningInvoiceRow } from "./dunning"

describe("todayInZone", () => {
  it("returns the local calendar date in the clinic timezone", () => {
    // 2026-06-12T02:00:00Z is still 2026-06-11 in São Paulo (UTC-3)
    const d = new Date("2026-06-12T02:00:00.000Z")
    expect(todayInZone(d, "America/Sao_Paulo")).toBe("2026-06-11")
  })

  it("returns the same date for UTC", () => {
    const d = new Date("2026-06-12T12:00:00.000Z")
    expect(todayInZone(d, "UTC")).toBe("2026-06-12")
  })
})

describe("dueDateWindow", () => {
  it("spans the widest dueDate range across offsets", () => {
    // offsets -3,0,3,7 → dueDate candidates today-(-3..7) = today+3 .. today-7
    const w = dueDateWindow("2026-06-12", [-3, 0, 3, 7])
    expect(w.gte).toBe("2026-06-05") // today - 7
    expect(w.lte).toBe("2026-06-15") // today + 3
  })

  it("handles a single offset", () => {
    const w = dueDateWindow("2026-06-12", [0])
    expect(w.gte).toBe("2026-06-12")
    expect(w.lte).toBe("2026-06-12")
  })
})

function row(overrides: Partial<DunningInvoiceRow> = {}): DunningInvoiceRow {
  return {
    id: "inv1",
    status: "PENDENTE",
    dueDate: new Date("2026-06-12T12:00:00.000Z"),
    totalAmount: 300,
    linkAmounts: [],
    patient: {
      dunningOptOut: false,
      consentWhatsApp: true,
      consentEmail: true,
      phone: "+5511999999999",
      email: "p@x.com",
    },
    reminders: [],
    ...overrides,
  }
}

describe("toDunningInput", () => {
  it("maps a basic invoice row", () => {
    const out = toDunningInput(row(), "UTC")
    expect(out).toEqual({
      invoiceId: "inv1",
      status: "PENDENTE",
      dueDate: "2026-06-12",
      openAmount: 300,
      patient: {
        dunningOptOut: false,
        consentWhatsApp: true,
        consentEmail: true,
        hasPhone: true,
        hasEmail: true,
      },
      remindersSent: 0,
      lastReminderDate: null,
    })
  })

  it("computes open amount from reconciliation links", () => {
    const out = toDunningInput(row({ linkAmounts: [100] }), "UTC")
    expect(out?.openAmount).toBe(200)
  })

  it("returns null for invoices without a patient", () => {
    expect(toDunningInput(row({ patient: null }), "UTC")).toBeNull()
  })

  it("returns null for PAGO / CANCELADO statuses", () => {
    expect(toDunningInput(row({ status: "PAGO" }), "UTC")).toBeNull()
    expect(toDunningInput(row({ status: "CANCELADO" }), "UTC")).toBeNull()
  })

  it("derives lastReminderDate as the most recent reminder date", () => {
    const out = toDunningInput(
      row({
        reminders: [
          { createdAt: new Date("2026-06-10T12:00:00.000Z") },
          { createdAt: new Date("2026-06-12T12:00:00.000Z") },
        ],
      }),
      "UTC"
    )
    expect(out?.remindersSent).toBe(2)
    expect(out?.lastReminderDate).toBe("2026-06-12")
  })

  it("flags missing contact channels", () => {
    const out = toDunningInput(
      row({
        patient: {
          dunningOptOut: false,
          consentWhatsApp: true,
          consentEmail: false,
          phone: null,
          email: null,
        },
      }),
      "UTC"
    )
    expect(out?.patient.hasPhone).toBe(false)
    expect(out?.patient.hasEmail).toBe(false)
  })
})
