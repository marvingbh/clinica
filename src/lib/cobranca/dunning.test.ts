import { describe, it, expect } from "vitest"
import {
  selectDunningCandidates,
  type DunningInvoiceInput,
  type DunningConfigInput,
} from "./dunning"

const config: DunningConfigInput = {
  enabled: true,
  offsets: [-3, 0, 3, 7],
  sendWhatsApp: true,
  sendEmail: true,
  maxAttempts: 4,
}

function invoice(overrides: Partial<DunningInvoiceInput> = {}): DunningInvoiceInput {
  return {
    invoiceId: "inv_1",
    status: "ENVIADO",
    dueDate: "2026-06-15",
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
    ...overrides,
  }
}

describe("selectDunningCandidates", () => {
  it("matches D-3, D0, D+3 and D+7 against today", () => {
    expect(selectDunningCandidates([invoice()], config, "2026-06-12")).toHaveLength(1) // D-3
    expect(selectDunningCandidates([invoice()], config, "2026-06-15")).toHaveLength(1) // D0
    expect(selectDunningCandidates([invoice()], config, "2026-06-18")).toHaveLength(1) // D+3
    expect(selectDunningCandidates([invoice()], config, "2026-06-22")).toHaveLength(1) // D+7
  })

  it("does not match a non-offset day", () => {
    expect(selectDunningCandidates([invoice()], config, "2026-06-13")).toHaveLength(0)
  })

  it("returns [] when config disabled", () => {
    expect(selectDunningCandidates([invoice()], { ...config, enabled: false }, "2026-06-15")).toEqual(
      []
    )
  })

  it("excludes when maxAttempts reached", () => {
    expect(
      selectDunningCandidates([invoice({ remindersSent: 4 })], config, "2026-06-15")
    ).toHaveLength(0)
    expect(
      selectDunningCandidates([invoice({ remindersSent: 3 })], config, "2026-06-15")
    ).toHaveLength(1)
  })

  it("excludes opted-out patients", () => {
    expect(
      selectDunningCandidates(
        [invoice({ patient: { ...invoice().patient, dunningOptOut: true } })],
        config,
        "2026-06-15"
      )
    ).toHaveLength(0)
  })

  it("falls back to EMAIL only when no WhatsApp consent", () => {
    const res = selectDunningCandidates(
      [invoice({ patient: { ...invoice().patient, consentWhatsApp: false } })],
      config,
      "2026-06-15"
    )
    expect(res[0].channels).toEqual(["EMAIL"])
  })

  it("falls back to WHATSAPP only when no email consent", () => {
    const res = selectDunningCandidates(
      [invoice({ patient: { ...invoice().patient, consentEmail: false } })],
      config,
      "2026-06-15"
    )
    expect(res[0].channels).toEqual(["WHATSAPP"])
  })

  it("respects clinic channel toggles", () => {
    const res = selectDunningCandidates([invoice()], { ...config, sendEmail: false }, "2026-06-15")
    expect(res[0].channels).toEqual(["WHATSAPP"])
  })

  it("excludes when no channel resolves (no contact info)", () => {
    expect(
      selectDunningCandidates(
        [invoice({ patient: { ...invoice().patient, hasPhone: false, hasEmail: false } })],
        config,
        "2026-06-15"
      )
    ).toHaveLength(0)
  })

  it("is idempotent for the day (lastReminderDate === today)", () => {
    expect(
      selectDunningCandidates([invoice({ lastReminderDate: "2026-06-15" })], config, "2026-06-15")
    ).toHaveLength(0)
  })

  it("includes a PARCIAL invoice with open balance", () => {
    expect(
      selectDunningCandidates([invoice({ status: "PARCIAL", openAmount: 100 })], config, "2026-06-15")
    ).toHaveLength(1)
  })

  it("excludes an invoice with no open balance", () => {
    expect(selectDunningCandidates([invoice({ openAmount: 0 })], config, "2026-06-15")).toHaveLength(
      0
    )
  })

  it("produces a single candidate when offsets overlap on one day", () => {
    // dueDate today and an offset that also lands today would not normally
    // overlap, but verify only one candidate is emitted per invoice.
    const res = selectDunningCandidates(
      [invoice({ dueDate: "2026-06-15" })],
      { ...config, offsets: [0, 0] },
      "2026-06-15"
    )
    expect(res).toHaveLength(1)
  })
})
