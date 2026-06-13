import { describe, it, expect } from "vitest"
import { computeRebooking } from "./rebooking"
import type { PatientSession } from "./retention"

function s(patientId: string, iso: string): PatientSession {
  return { patientId, scheduledAt: new Date(iso) }
}

describe("computeRebooking", () => {
  it("counts a next session within the 7-day window", () => {
    const finalized = [s("p1", "2026-05-01T13:00:00Z")]
    const candidates = [
      s("p1", "2026-05-01T13:00:00Z"), // the same session — must not self-match
      s("p1", "2026-05-06T13:00:00Z"), // 5 days later → within window
    ]
    const r = computeRebooking({ finalizedInRange: finalized, candidateNextSessions: candidates, windowDays: 7 })
    expect(r.total).toBe(1)
    expect(r.rebooked).toBe(1)
    expect(r.rate).toBe(1)
  })

  it("is inclusive at exactly the window boundary", () => {
    const finalized = [s("p1", "2026-05-01T13:00:00Z")]
    const candidates = [s("p1", "2026-05-08T13:00:00Z")] // exactly +7 days
    const r = computeRebooking({ finalizedInRange: finalized, candidateNextSessions: candidates, windowDays: 7 })
    expect(r.rebooked).toBe(1)
  })

  it("excludes a session just outside the window", () => {
    const finalized = [s("p1", "2026-05-01T13:00:00Z")]
    const candidates = [s("p1", "2026-05-09T13:00:00Z")] // +8 days
    const r = computeRebooking({ finalizedInRange: finalized, candidateNextSessions: candidates, windowDays: 7 })
    expect(r.rebooked).toBe(0)
    expect(r.rate).toBe(0)
  })

  it("captures monthly cadence with a 30-day window", () => {
    const finalized = [s("p1", "2026-05-01T13:00:00Z")]
    const candidates = [s("p1", "2026-05-22T13:00:00Z")] // +21 days
    const r7 = computeRebooking({ finalizedInRange: finalized, candidateNextSessions: candidates, windowDays: 7 })
    const r30 = computeRebooking({ finalizedInRange: finalized, candidateNextSessions: candidates, windowDays: 30 })
    expect(r7.rebooked).toBe(0)
    expect(r30.rebooked).toBe(1)
  })

  it("does not match candidates of a different patient", () => {
    const finalized = [s("p1", "2026-05-01T13:00:00Z")]
    const candidates = [s("p2", "2026-05-03T13:00:00Z")]
    const r = computeRebooking({ finalizedInRange: finalized, candidateNextSessions: candidates, windowDays: 7 })
    expect(r.rebooked).toBe(0)
  })

  it("returns null rate when there are no finalized sessions", () => {
    const r = computeRebooking({ finalizedInRange: [], candidateNextSessions: [], windowDays: 7 })
    expect(r.total).toBe(0)
    expect(r.rate).toBeNull()
  })
})
