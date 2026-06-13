import { describe, it, expect } from "vitest"
import {
  isCadenceDue,
  isWithinPreSessionWindow,
  decideSchedule,
  describeCadence,
  PRE_SESSION_WINDOW_HOURS,
  type ScheduleDecisionInput,
} from "./schedule"

const NOW = new Date("2026-06-12T12:00:00Z")
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

function baseInput(over: Partial<ScheduleDecisionInput> = {}): ScheduleDecisionInput {
  return {
    cadenceType: "A_CADA_N_SEMANAS",
    intervalWeeks: 4,
    lastSentAt: null,
    now: NOW,
    nextConsultaAt: null,
    alreadySentForAppointment: false,
    professionalIsActive: true,
    hasConsentedChannel: true,
    recordClosedAt: null,
    ...over,
  }
}

describe("isCadenceDue", () => {
  it("is due when never sent", () => {
    expect(isCadenceDue(null, 4, NOW)).toBe(true)
  })

  it("is due exactly N weeks after the last send", () => {
    const last = new Date(NOW.getTime() - 4 * WEEK_MS)
    expect(isCadenceDue(last, 4, NOW)).toBe(true)
  })

  it("is NOT due one day before N weeks have elapsed", () => {
    const last = new Date(NOW.getTime() - (4 * WEEK_MS - 24 * HOUR_MS))
    expect(isCadenceDue(last, 4, NOW)).toBe(false)
  })
})

describe("isWithinPreSessionWindow", () => {
  it("is within when the consulta is in 24h", () => {
    expect(isWithinPreSessionWindow(new Date(NOW.getTime() + 24 * HOUR_MS), NOW)).toBe(true)
  })

  it("is within at exactly the 36h boundary", () => {
    expect(
      isWithinPreSessionWindow(new Date(NOW.getTime() + PRE_SESSION_WINDOW_HOURS * HOUR_MS), NOW)
    ).toBe(true)
  })

  it("is NOT within just past 36h", () => {
    expect(
      isWithinPreSessionWindow(
        new Date(NOW.getTime() + (PRE_SESSION_WINDOW_HOURS + 1) * HOUR_MS),
        NOW
      )
    ).toBe(false)
  })

  it("is NOT within for a past consulta (now boundary excluded)", () => {
    expect(isWithinPreSessionWindow(NOW, NOW)).toBe(false)
    expect(isWithinPreSessionWindow(new Date(NOW.getTime() - HOUR_MS), NOW)).toBe(false)
  })
})

describe("decideSchedule — pause priority", () => {
  it("PAUSE PROFISSIONAL_INATIVO when professional is inactive (highest priority)", () => {
    const d = decideSchedule(
      baseInput({ professionalIsActive: false, hasConsentedChannel: false })
    )
    expect(d).toEqual({ action: "PAUSE", reason: "PROFISSIONAL_INATIVO" })
  })

  it("PAUSE SEM_CANAL_CONSENTIDO when no consented channel", () => {
    const d = decideSchedule(baseInput({ hasConsentedChannel: false }))
    expect(d).toEqual({ action: "PAUSE", reason: "SEM_CANAL_CONSENTIDO" })
  })

  it("PAUSE SEM_AGENDAMENTOS_FUTUROS when no future consulta and record closed", () => {
    const d = decideSchedule(
      baseInput({ nextConsultaAt: null, recordClosedAt: new Date("2026-06-01") })
    )
    expect(d).toEqual({ action: "PAUSE", reason: "SEM_AGENDAMENTOS_FUTUROS" })
  })

  it("does NOT pause when no future consulta but record is still open (recordClosedAt null)", () => {
    // cadence due + channel ok ⇒ SEND (no consulta needed for N-weeks cadence)
    const d = decideSchedule(baseInput({ nextConsultaAt: null, lastSentAt: null }))
    expect(d).toEqual({ action: "SEND", targetAppointment: false })
  })
})

describe("decideSchedule — A_CADA_N_SEMANAS", () => {
  it("SEND when due and channel ok", () => {
    expect(decideSchedule(baseInput({ lastSentAt: null }))).toEqual({
      action: "SEND",
      targetAppointment: false,
    })
  })

  it("SKIP when not yet due", () => {
    const last = new Date(NOW.getTime() - WEEK_MS) // only 1 of 4 weeks
    expect(decideSchedule(baseInput({ lastSentAt: last }))).toEqual({ action: "SKIP" })
  })

  it("SKIP when intervalWeeks is missing/invalid", () => {
    expect(decideSchedule(baseInput({ intervalWeeks: null }))).toEqual({ action: "SKIP" })
  })
})

describe("decideSchedule — ANTES_DE_SESSAO", () => {
  it("SEND targeting the appointment when within window and not yet sent", () => {
    const d = decideSchedule(
      baseInput({
        cadenceType: "ANTES_DE_SESSAO",
        intervalWeeks: null,
        nextConsultaAt: new Date(NOW.getTime() + 12 * HOUR_MS),
      })
    )
    expect(d).toEqual({ action: "SEND", targetAppointment: true })
  })

  it("SKIP when already sent for that appointment (dedup)", () => {
    const d = decideSchedule(
      baseInput({
        cadenceType: "ANTES_DE_SESSAO",
        intervalWeeks: null,
        nextConsultaAt: new Date(NOW.getTime() + 12 * HOUR_MS),
        alreadySentForAppointment: true,
      })
    )
    expect(d).toEqual({ action: "SKIP" })
  })

  it("SKIP when the consulta is outside the window", () => {
    const d = decideSchedule(
      baseInput({
        cadenceType: "ANTES_DE_SESSAO",
        intervalWeeks: null,
        nextConsultaAt: new Date(NOW.getTime() + 72 * HOUR_MS),
      })
    )
    expect(d).toEqual({ action: "SKIP" })
  })

  it("SKIP when there is no future consulta (and record open)", () => {
    const d = decideSchedule(
      baseInput({ cadenceType: "ANTES_DE_SESSAO", intervalWeeks: null, nextConsultaAt: null })
    )
    expect(d).toEqual({ action: "SKIP" })
  })
})

describe("describeCadence", () => {
  it("describes pre-session cadence", () => {
    expect(describeCadence("ANTES_DE_SESSAO", null)).toBe("Antes de cada sessão")
  })

  it("describes weekly cadence (singular and plural)", () => {
    expect(describeCadence("A_CADA_N_SEMANAS", 1)).toBe("A cada 1 semana")
    expect(describeCadence("A_CADA_N_SEMANAS", 4)).toBe("A cada 4 semanas")
  })

  it("falls back for an unknown/incomplete cadence", () => {
    expect(describeCadence("A_CADA_N_SEMANAS", null)).toBe("Cadência indefinida")
  })
})
