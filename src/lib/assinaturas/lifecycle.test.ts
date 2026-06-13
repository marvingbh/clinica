import { describe, it, expect } from "vitest"
import {
  activeRequest,
  canResend,
  canCancelEnvelope,
  isRequestExpired,
  envelopeStatusFrom,
  reminderDue,
} from "./lifecycle"

describe("activeRequest", () => {
  it("returns the lowest-order non-final request, skipping signed ones", () => {
    const reqs = [
      { id: "a", signingOrder: 1, status: "ASSINADO" as const },
      { id: "b", signingOrder: 2, status: "PENDENTE" as const },
      { id: "c", signingOrder: 3, status: "PENDENTE" as const },
    ]
    expect(activeRequest(reqs)?.id).toBe("b")
  })

  it("returns null when a non-signed blocking status precedes the rest", () => {
    const reqs = [
      { id: "a", signingOrder: 1, status: "RECUSADO" as const },
      { id: "b", signingOrder: 2, status: "PENDENTE" as const },
    ]
    expect(activeRequest(reqs)).toBeNull()
  })

  it("returns null when all signed", () => {
    expect(
      activeRequest([{ id: "a", signingOrder: 1, status: "ASSINADO" }])
    ).toBeNull()
  })
})

describe("envelopeStatusFrom", () => {
  it("all assinado ⇒ CONCLUIDO", () => {
    expect(envelopeStatusFrom([{ status: "ASSINADO" }, { status: "ASSINADO" }])).toBe("CONCLUIDO")
  })
  it("any recusado ⇒ RECUSADO (priority over signed)", () => {
    expect(envelopeStatusFrom([{ status: "ASSINADO" }, { status: "RECUSADO" }])).toBe("RECUSADO")
  })
  it("cancelado and invalidado take priority", () => {
    expect(envelopeStatusFrom([{ status: "CANCELADO" }, { status: "RECUSADO" }])).toBe("CANCELADO")
    expect(envelopeStatusFrom([{ status: "INVALIDADO" }, { status: "RECUSADO" }])).toBe("INVALIDADO")
  })
  it("expired with no actionable left ⇒ EXPIRADO", () => {
    expect(envelopeStatusFrom([{ status: "EXPIRADO" }])).toBe("EXPIRADO")
  })
  it("still has a pendente ⇒ EM_ANDAMENTO", () => {
    expect(envelopeStatusFrom([{ status: "ASSINADO" }, { status: "PENDENTE" }])).toBe("EM_ANDAMENTO")
  })
})

describe("canResend / canCancelEnvelope", () => {
  it("canResend for pendente/visualizado/expirado only", () => {
    expect(canResend({ status: "PENDENTE" })).toBe(true)
    expect(canResend({ status: "VISUALIZADO" })).toBe(true)
    expect(canResend({ status: "EXPIRADO" })).toBe(true)
    expect(canResend({ status: "ASSINADO" })).toBe(false)
    expect(canResend({ status: "CANCELADO" })).toBe(false)
  })
  it("canCancelEnvelope only when EM_ANDAMENTO", () => {
    expect(canCancelEnvelope("EM_ANDAMENTO")).toBe(true)
    expect(canCancelEnvelope("CONCLUIDO")).toBe(false)
    expect(canCancelEnvelope("CANCELADO")).toBe(false)
  })
})

describe("isRequestExpired", () => {
  it("uses an exact boundary and only for actionable statuses", () => {
    const now = new Date("2026-06-11T12:00:00Z")
    expect(isRequestExpired({ expiresAt: new Date("2026-06-11T12:00:00Z"), status: "PENDENTE" }, now)).toBe(false)
    expect(isRequestExpired({ expiresAt: new Date("2026-06-11T11:59:59Z"), status: "PENDENTE" }, now)).toBe(true)
    expect(isRequestExpired({ expiresAt: new Date("2026-06-11T11:00:00Z"), status: "ASSINADO" }, now)).toBe(false)
  })
})

describe("reminderDue", () => {
  const sent = new Date("2026-06-01T00:00:00Z")
  it("D+2 ⇒ no, D+3 ⇒ yes", () => {
    const base = { linkSentAt: sent, remindersSent: 0, lastReminderAt: null, status: "PENDENTE" as const }
    expect(reminderDue(base, new Date("2026-06-03T00:00:00Z"))).toBe(false)
    expect(reminderDue(base, new Date("2026-06-04T00:00:00Z"))).toBe(true)
  })
  it("D+7 ⇒ yes when one reminder already sent", () => {
    expect(
      reminderDue(
        { linkSentAt: sent, remindersSent: 1, lastReminderAt: new Date("2026-06-04T00:00:00Z"), status: "VISUALIZADO" },
        new Date("2026-06-08T00:00:00Z")
      )
    ).toBe(true)
  })
  it("max 2 reminders", () => {
    expect(
      reminderDue(
        { linkSentAt: sent, remindersSent: 2, lastReminderAt: new Date("2026-06-08T00:00:00Z"), status: "PENDENTE" },
        new Date("2026-06-20T00:00:00Z")
      )
    ).toBe(false)
  })
  it("never reminds ASSINADO/RECUSADO", () => {
    expect(reminderDue({ linkSentAt: sent, remindersSent: 0, lastReminderAt: null, status: "ASSINADO" }, new Date("2026-06-20T00:00:00Z"))).toBe(false)
  })
  it("idempotent: already reminded today does not repeat", () => {
    expect(
      reminderDue(
        { linkSentAt: sent, remindersSent: 1, lastReminderAt: new Date("2026-06-04T06:00:00Z"), status: "PENDENTE" },
        new Date("2026-06-04T10:00:00Z")
      )
    ).toBe(false)
  })
})
