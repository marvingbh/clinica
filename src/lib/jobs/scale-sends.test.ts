import { describe, it, expect } from "vitest"
import { buildScheduleDecisionInput, pickSendChannel } from "./scale-sends"

const NOW = new Date("2026-06-12T12:00:00Z")

const fullConsent = { consentWhatsApp: true, phone: "5511999", consentEmail: true, email: "a@b.com" }
const emailOnly = { consentWhatsApp: false, phone: null, consentEmail: true, email: "a@b.com" }
const whatsappOnly = { consentWhatsApp: true, phone: "5511999", consentEmail: false, email: null }
const noConsent = { consentWhatsApp: false, phone: null, consentEmail: false, email: null }

describe("buildScheduleDecisionInput", () => {
  it("maps row fields and computes hasConsentedChannel (true when any channel)", () => {
    const input = buildScheduleDecisionInput(
      { cadenceType: "A_CADA_N_SEMANAS", intervalWeeks: 4, lastSentAt: null },
      {
        now: NOW,
        nextConsultaAt: null,
        alreadySentForAppointment: false,
        professionalIsActive: true,
        patient: emailOnly,
        recordClosedAt: null,
      }
    )
    expect(input.cadenceType).toBe("A_CADA_N_SEMANAS")
    expect(input.intervalWeeks).toBe(4)
    expect(input.hasConsentedChannel).toBe(true)
    expect(input.now).toBe(NOW)
  })

  it("hasConsentedChannel is false when the patient consented to nothing", () => {
    const input = buildScheduleDecisionInput(
      { cadenceType: "ANTES_DE_SESSAO", intervalWeeks: null, lastSentAt: null },
      {
        now: NOW,
        nextConsultaAt: NOW,
        alreadySentForAppointment: false,
        professionalIsActive: true,
        patient: noConsent,
        recordClosedAt: null,
      }
    )
    expect(input.hasConsentedChannel).toBe(false)
  })
})

describe("pickSendChannel", () => {
  it("prefers EMAIL when both channels are consented", () => {
    expect(pickSendChannel(fullConsent)).toBe("EMAIL")
  })

  it("returns WHATSAPP when only WhatsApp is consented", () => {
    expect(pickSendChannel(whatsappOnly)).toBe("WHATSAPP")
  })

  it("returns EMAIL when only email is consented", () => {
    expect(pickSendChannel(emailOnly)).toBe("EMAIL")
  })

  it("returns null when no channel is consented", () => {
    expect(pickSendChannel(noConsent)).toBeNull()
  })
})
