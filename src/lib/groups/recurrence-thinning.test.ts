import { describe, it, expect } from "vitest"
import { computeSessionsToThin } from "./recurrence-thinning"

/** Build a weekly grid of sessions starting at a Friday, one id per date. */
function weeklySessions(count: number, startISO = "2026-06-19T10:15:00") {
  const start = new Date(startISO)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i * 7)
    return { id: `s${i}`, scheduledAt: d }
  })
}

describe("computeSessionsToThin", () => {
  it("WEEKLY -> BIWEEKLY removes every other session (the off weeks)", () => {
    const sessions = weeklySessions(6) // s0..s5 at 0,7,14,21,28,35 days
    const removed = computeSessionsToThin(sessions, "WEEKLY", "BIWEEKLY")
    // keep s0 (0), s2 (14), s4 (28); remove s1 (7), s3 (21), s5 (35)
    expect(removed).toEqual(["s1", "s3", "s5"])
  })

  it("anchors on the earliest upcoming session", () => {
    const sessions = weeklySessions(3)
    const removed = computeSessionsToThin(sessions, "WEEKLY", "BIWEEKLY")
    expect(removed).not.toContain("s0") // anchor is always kept
  })

  it("WEEKLY -> MONTHLY keeps every 4th weekly session", () => {
    const sessions = weeklySessions(9) // 0,7,...,56 days
    const removed = computeSessionsToThin(sessions, "WEEKLY", "MONTHLY")
    // keep s0 (0), s4 (28), s8 (56); remove the rest
    expect(removed).toEqual(["s1", "s2", "s3", "s5", "s6", "s7"])
  })

  it("removes all appointments sharing an off-cadence date (e.g. a dupla)", () => {
    const base = weeklySessions(4)
    // duplicate each date with a second appointment (second patient)
    const withDuplicates = base.flatMap((s, i) => [
      s,
      { id: `s${i}b`, scheduledAt: new Date(s.scheduledAt) },
    ])
    const removed = computeSessionsToThin(withDuplicates, "WEEKLY", "BIWEEKLY")
    // off weeks are index 1 (7d) and 3 (21d) -> both appts on each removed
    expect(new Set(removed)).toEqual(new Set(["s1", "s1b", "s3", "s3b"]))
  })

  it("returns empty when cadence is unchanged", () => {
    expect(computeSessionsToThin(weeklySessions(4), "WEEKLY", "WEEKLY")).toEqual([])
  })

  it("returns empty when cadence becomes MORE frequent (BIWEEKLY -> WEEKLY)", () => {
    const biweekly = [
      { id: "a", scheduledAt: new Date("2026-06-19T10:15:00") },
      { id: "b", scheduledAt: new Date("2026-07-03T10:15:00") },
    ]
    expect(computeSessionsToThin(biweekly, "BIWEEKLY", "WEEKLY")).toEqual([])
  })

  it("returns empty for no sessions", () => {
    expect(computeSessionsToThin([], "WEEKLY", "BIWEEKLY")).toEqual([])
  })

  it("BIWEEKLY -> MONTHLY removes every other biweekly session", () => {
    const start = new Date("2026-06-19T10:15:00")
    const biweekly = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i * 14) // 0,14,28,42 days
      return { id: `b${i}`, scheduledAt: d }
    })
    const removed = computeSessionsToThin(biweekly, "BIWEEKLY", "MONTHLY")
    // keep b0 (0), b2 (28); remove b1 (14), b3 (42)
    expect(removed).toEqual(["b1", "b3"])
  })
})
