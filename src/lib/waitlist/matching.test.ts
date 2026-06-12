import { describe, it, expect } from "vitest"
import { toLocalSlot, slotMatchesPreferences, rankCandidates } from "./matching"
import type { MatchableEntry, WaitlistPreferences } from "./types"

const TZ = "America/Sao_Paulo"

function prefs(overrides: Partial<WaitlistPreferences> = {}): WaitlistPreferences {
  return { weekdays: [], timeRanges: [], modality: null, ...overrides }
}

describe("toLocalSlot", () => {
  it("converts a UTC instant to São Paulo weekday + HH:mm", () => {
    // 2026-06-15 is a Monday. 17:00Z = 14:00 SP (UTC-3).
    const local = toLocalSlot(
      {
        scheduledAt: new Date("2026-06-15T17:00:00.000Z"),
        endAt: new Date("2026-06-15T17:50:00.000Z"),
      },
      TZ
    )
    expect(local).toEqual({ weekday: 1, startTime: "14:00", endTime: "14:50" })
  })

  it("handles day rollover across the UTC/SP boundary", () => {
    // 2026-06-16T01:00Z = 2026-06-15 22:00 SP (still Monday in SP).
    const local = toLocalSlot(
      {
        scheduledAt: new Date("2026-06-16T01:00:00.000Z"),
        endAt: new Date("2026-06-16T01:50:00.000Z"),
      },
      TZ
    )
    expect(local.weekday).toBe(1)
    expect(local.startTime).toBe("22:00")
  })
})

describe("slotMatchesPreferences", () => {
  const monday14: ReturnType<typeof toLocalSlot> = {
    weekday: 1,
    startTime: "18:00",
    endTime: "18:50",
  }

  it("empty preferences accept anything", () => {
    expect(slotMatchesPreferences(monday14, "ONLINE", prefs())).toBe(true)
  })

  it("matches when weekday is in the list", () => {
    expect(slotMatchesPreferences(monday14, null, prefs({ weekdays: [1, 3] }))).toBe(true)
  })

  it("rejects when weekday not in the list", () => {
    expect(slotMatchesPreferences(monday14, null, prefs({ weekdays: [2, 4] }))).toBe(false)
  })

  it("matches a slot inside a preferred time window", () => {
    expect(
      slotMatchesPreferences(monday14, null, prefs({ timeRanges: [{ start: "18:00", end: "21:00" }] }))
    ).toBe(true)
  })

  it("rejects a slot outside the time window", () => {
    expect(
      slotMatchesPreferences(monday14, null, prefs({ timeRanges: [{ start: "08:00", end: "12:00" }] }))
    ).toBe(false)
  })

  it("rejects a slot partially overflowing the window", () => {
    const lateSlot = { weekday: 1, startTime: "20:30", endTime: "21:20" }
    expect(
      slotMatchesPreferences(lateSlot, null, prefs({ timeRanges: [{ start: "18:00", end: "21:00" }] }))
    ).toBe(false)
  })

  it("modality null preference accepts both online and presencial", () => {
    expect(slotMatchesPreferences(monday14, "ONLINE", prefs({ modality: null }))).toBe(true)
    expect(slotMatchesPreferences(monday14, "PRESENCIAL", prefs({ modality: null }))).toBe(true)
  })

  it("modality preference rejects the other modality", () => {
    expect(slotMatchesPreferences(monday14, "PRESENCIAL", prefs({ modality: "ONLINE" }))).toBe(false)
  })

  it("null slot modality matches any preference", () => {
    expect(slotMatchesPreferences(monday14, null, prefs({ modality: "ONLINE" }))).toBe(true)
  })
})

describe("rankCandidates", () => {
  const slot = {
    professionalProfileId: "prof-1",
    scheduledAt: new Date("2026-06-15T17:00:00.000Z"),
    endAt: new Date("2026-06-15T17:50:00.000Z"),
    modality: "ONLINE" as const,
    sourceAppointmentId: "apt-cancel",
  }
  const local = toLocalSlot(slot, TZ)

  function entry(over: Partial<MatchableEntry>): MatchableEntry {
    return {
      id: "e",
      patientId: "p",
      professionalProfileId: null,
      preferences: prefs(),
      priority: 0,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      ...over,
    }
  }

  it("ranks explicit professional above 'qualquer'", () => {
    const any = entry({ id: "any", professionalProfileId: null })
    const explicit = entry({ id: "explicit", professionalProfileId: "prof-1" })
    const ranked = rankCandidates({
      slot,
      local,
      entries: [any, explicit],
      sameDayPatientIds: new Set(),
    })
    expect(ranked.map((c) => c.entry.id)).toEqual(["explicit", "any"])
    expect(ranked[0].professionalMatch).toBe(true)
  })

  it("excludes entries citing a different professional", () => {
    const other = entry({ id: "other", professionalProfileId: "prof-2" })
    const ranked = rankCandidates({
      slot,
      local,
      entries: [other],
      sameDayPatientIds: new Set(),
    })
    expect(ranked).toHaveLength(0)
  })

  it("breaks ties by priority asc then createdAt asc", () => {
    const a = entry({ id: "a", priority: 5, createdAt: new Date("2026-06-01T00:00:00Z") })
    const b = entry({ id: "b", priority: 1, createdAt: new Date("2026-06-05T00:00:00Z") })
    const c = entry({ id: "c", priority: 1, createdAt: new Date("2026-06-02T00:00:00Z") })
    const ranked = rankCandidates({
      slot,
      local,
      entries: [a, b, c],
      sameDayPatientIds: new Set(),
    })
    expect(ranked.map((x) => x.entry.id)).toEqual(["c", "b", "a"])
  })

  it("flags same-day appointment and pushes it to the end", () => {
    const fresh = entry({ id: "fresh", patientId: "p-fresh" })
    const busy = entry({ id: "busy", patientId: "p-busy", priority: -10 })
    const ranked = rankCandidates({
      slot,
      local,
      entries: [busy, fresh],
      sameDayPatientIds: new Set(["p-busy"]),
    })
    expect(ranked.map((x) => x.entry.id)).toEqual(["fresh", "busy"])
    expect(ranked.find((x) => x.entry.id === "busy")?.hasSameDayAppointment).toBe(true)
  })

  it("excludes entries whose preferences do not cover the slot", () => {
    const mismatch = entry({ id: "mismatch", preferences: prefs({ weekdays: [0] }) })
    const ranked = rankCandidates({
      slot,
      local,
      entries: [mismatch],
      sameDayPatientIds: new Set(),
    })
    expect(ranked).toHaveLength(0)
  })
})
