import { describe, it, expect } from "vitest"
import { computeRetention, type PatientSession } from "./retention"
import type { DateRange } from "./types"

function d(iso: string): Date {
  return new Date(iso)
}

// Period = May 2026.
const range: DateRange = { start: d("2026-05-01T00:00:00Z"), end: d("2026-06-01T00:00:00Z") }
const now = d("2026-06-15T12:00:00Z")

function s(patientId: string, iso: string): PatientSession {
  return { patientId, scheduledAt: d(iso) }
}

describe("computeRetention", () => {
  it("cohort = patients whose first session of history falls in the period", () => {
    const sessions: PatientSession[] = [
      // p1: first session in May → in cohort
      s("p1", "2026-05-03T13:00:00Z"),
      s("p1", "2026-05-10T13:00:00Z"),
      // p2: first session in April → NOT in cohort even though it has a May session
      s("p2", "2026-04-20T13:00:00Z"),
      s("p2", "2026-05-05T13:00:00Z"),
    ]
    const r = computeRetention({
      allFinalizadoSessions: sessions,
      futureBookedPatientIds: new Set(),
      range,
      now,
    })
    expect(r.cohortSize).toBe(1)
  })

  it("counts 2nd/5th-session reach beyond the period window", () => {
    const sessions: PatientSession[] = [
      s("p1", "2026-05-03T13:00:00Z"), // first in May
      s("p1", "2026-06-03T13:00:00Z"), // 2nd in June (beyond period)
      s("p1", "2026-06-10T13:00:00Z"),
      s("p1", "2026-06-17T13:00:00Z"),
      s("p1", "2026-06-24T13:00:00Z"), // 5th
    ]
    const r = computeRetention({
      allFinalizadoSessions: sessions,
      futureBookedPatientIds: new Set(),
      range,
      now,
    })
    expect(r.cohortSize).toBe(1)
    expect(r.reached2ndPct).toBe(1)
    expect(r.reached5thPct).toBe(1)
  })

  it("computes average and median lifetime (odd count)", () => {
    const sessions: PatientSession[] = [
      s("a", "2026-05-01T13:00:00Z"),
      s("b", "2026-05-02T13:00:00Z"),
      s("b", "2026-05-09T13:00:00Z"),
      s("c", "2026-05-03T13:00:00Z"),
      s("c", "2026-05-10T13:00:00Z"),
      s("c", "2026-05-17T13:00:00Z"),
    ]
    // lifetimes: a=1, b=2, c=3 → avg 2, median 2
    const r = computeRetention({
      allFinalizadoSessions: sessions,
      futureBookedPatientIds: new Set(),
      range,
      now,
    })
    expect(r.avgSessionsPerPatient).toBe(2)
    expect(r.medianLifetimeSessions).toBe(2)
  })

  it("computes median for an even-sized cohort", () => {
    const sessions: PatientSession[] = [
      s("a", "2026-05-01T13:00:00Z"),
      s("b", "2026-05-02T13:00:00Z"),
      s("b", "2026-05-09T13:00:00Z"),
      s("c", "2026-05-03T13:00:00Z"),
      s("c", "2026-05-10T13:00:00Z"),
      s("c", "2026-05-17T13:00:00Z"),
      s("dd", "2026-05-04T13:00:00Z"),
      s("dd", "2026-05-11T13:00:00Z"),
      s("dd", "2026-05-18T13:00:00Z"),
      s("dd", "2026-05-25T13:00:00Z"),
    ]
    // lifetimes sorted: 1,2,3,4 → median (2+3)/2 = 2.5
    const r = computeRetention({
      allFinalizadoSessions: sessions,
      futureBookedPatientIds: new Set(),
      range,
      now,
    })
    expect(r.medianLifetimeSessions).toBe(2.5)
  })

  it("computes active30 / active60 relative to now", () => {
    const sessions: PatientSession[] = [
      s("recent", "2026-06-10T13:00:00Z"), // 5 days ago → active30 & active60
      s("mid", "2026-05-01T13:00:00Z"), // ~45 days ago → active60 only
      s("old", "2026-03-01T13:00:00Z"), // >60 days ago → neither
    ]
    const r = computeRetention({
      allFinalizadoSessions: sessions,
      futureBookedPatientIds: new Set(),
      range,
      now,
    })
    expect(r.active30).toBe(1)
    expect(r.active60).toBe(2)
  })

  it("dropped requires >60 days AND no future booking", () => {
    const sessions: PatientSession[] = [
      s("dropped", "2026-03-01T13:00:00Z"), // >60d, no future
      s("hasFuture", "2026-03-02T13:00:00Z"), // >60d but booked ahead
    ]
    const r = computeRetention({
      allFinalizadoSessions: sessions,
      futureBookedPatientIds: new Set(["hasFuture"]),
      range,
      now,
    })
    expect(r.droppedPatientIds).toEqual(["dropped"])
    expect(r.dropped).toBe(1)
  })

  it("flags a small sample (cohort < 5)", () => {
    const sessions: PatientSession[] = [
      s("a", "2026-05-01T13:00:00Z"),
      s("b", "2026-05-02T13:00:00Z"),
    ]
    const r = computeRetention({
      allFinalizadoSessions: sessions,
      futureBookedPatientIds: new Set(),
      range,
      now,
    })
    expect(r.smallSample).toBe(true)
  })

  it("returns nulls for an empty cohort", () => {
    const r = computeRetention({
      allFinalizadoSessions: [],
      futureBookedPatientIds: new Set(),
      range,
      now,
    })
    expect(r.cohortSize).toBe(0)
    expect(r.reached2ndPct).toBeNull()
    expect(r.reached5thPct).toBeNull()
    expect(r.avgSessionsPerPatient).toBeNull()
    expect(r.medianLifetimeSessions).toBeNull()
    expect(r.smallSample).toBe(false)
  })
})
