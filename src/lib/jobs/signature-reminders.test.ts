import { describe, it, expect, vi, afterEach } from "vitest"
import {
  selectRequestsToRemind,
  selectRequestsToExpire,
  buildReminderVariables,
} from "./signature-reminders"

const sent = new Date("2026-06-01T00:00:00Z")

function reqRow(over: Partial<{
  id: string
  status: string
  linkSentAt: Date | null
  remindersSent: number
  lastReminderAt: Date | null
  expiresAt: Date
}> = {}) {
  return {
    id: "r1",
    status: "PENDENTE",
    linkSentAt: sent,
    remindersSent: 0,
    lastReminderAt: null,
    expiresAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  }
}

afterEach(() => vi.useRealTimers())

describe("selectRequestsToRemind", () => {
  it("selects on D+3 but not on D+2", () => {
    vi.useFakeTimers()
    expect(selectRequestsToRemind([reqRow()], new Date("2026-06-03T00:00:00Z"))).toHaveLength(0)
    expect(selectRequestsToRemind([reqRow()], new Date("2026-06-04T00:00:00Z"))).toHaveLength(1)
  })

  it("never selects final statuses", () => {
    const rows = [reqRow({ status: "ASSINADO" }), reqRow({ status: "RECUSADO" }), reqRow({ status: "EXPIRADO" })]
    expect(selectRequestsToRemind(rows, new Date("2026-06-20T00:00:00Z"))).toHaveLength(0)
  })

  it("is idempotent — already reminded today is not selected again", () => {
    const row = reqRow({ remindersSent: 1, lastReminderAt: new Date("2026-06-04T06:00:00Z") })
    expect(selectRequestsToRemind([row], new Date("2026-06-04T10:00:00Z"))).toHaveLength(0)
  })
})

describe("selectRequestsToExpire", () => {
  it("expires only actionable requests past the exact boundary", () => {
    const now = new Date("2026-06-11T12:00:00Z")
    const past = reqRow({ expiresAt: new Date("2026-06-11T11:59:59Z") })
    const exact = reqRow({ expiresAt: new Date("2026-06-11T12:00:00Z") })
    const signed = reqRow({ status: "ASSINADO", expiresAt: new Date("2026-06-01T00:00:00Z") })
    expect(selectRequestsToExpire([past, exact, signed], now).map((r) => r.id)).toEqual(["r1"])
    expect(selectRequestsToExpire([exact], now)).toHaveLength(0)
    expect(selectRequestsToExpire([signed], now)).toHaveLength(0)
  })
})

describe("buildReminderVariables", () => {
  it("returns the template variable map", () => {
    expect(
      buildReminderVariables({ signerName: "Ana", clinicName: "X", documentTitle: "TCLE", signingLink: "https://l" })
    ).toEqual({ signerName: "Ana", clinicName: "X", documentTitle: "TCLE", signingLink: "https://l" })
  })
})
