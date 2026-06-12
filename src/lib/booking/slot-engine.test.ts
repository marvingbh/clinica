import { describe, it, expect } from "vitest"
import { resolveDayWindows, generateCandidates, computeFreeSlots } from "./slot-engine"
import { spToUtc } from "./timezone"
import type { RuleInput, ExceptionInput, SlotEngineInput } from "./types"

// 2026-06-15 is a Monday (weekday 1).
const MONDAY = "2026-06-15"

function rule(dayOfWeek: number, startTime: string, endTime: string, isActive = true): RuleInput {
  return { dayOfWeek, startTime, endTime, isActive }
}

function baseInput(over: Partial<SlotEngineInput>): SlotEngineInput {
  return {
    rules: [],
    exceptions: [],
    busy: [],
    durationMinutes: 50,
    bufferMinutes: 10,
    from: MONDAY,
    days: 1,
    // now is far in the past so no slot gets cut by minAdvance/horizon unless overridden.
    now: new Date("2026-06-01T00:00:00.000Z"),
    minAdvanceHours: 0,
    horizonDays: 365,
    ...over,
  }
}

describe("resolveDayWindows", () => {
  it("returns empty for a day with no rule", () => {
    expect(resolveDayWindows(MONDAY, [], [])).toEqual([])
  })

  it("returns the active rule window for the weekday", () => {
    const windows = resolveDayWindows(MONDAY, [rule(1, "09:00", "17:00")], [])
    expect(windows).toEqual([{ start: "09:00", end: "17:00" }])
  })

  it("ignores inactive rules", () => {
    expect(resolveDayWindows(MONDAY, [rule(1, "09:00", "17:00", false)], [])).toEqual([])
  })

  it("ignores rules for other weekdays", () => {
    expect(resolveDayWindows(MONDAY, [rule(2, "09:00", "17:00")], [])).toEqual([])
  })

  it("merges two rules on the same day", () => {
    const windows = resolveDayWindows(
      MONDAY,
      [rule(1, "09:00", "12:00"), rule(1, "14:00", "17:00")],
      []
    )
    expect(windows).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:00" },
    ])
  })

  it("specific-date full-day exception removes everything", () => {
    const ex: ExceptionInput = {
      date: MONDAY,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: null,
      endTime: null,
    }
    expect(resolveDayWindows(MONDAY, [rule(1, "09:00", "17:00")], [ex])).toEqual([])
  })

  it("partial exception 12:00-14:00 splits the window", () => {
    const ex: ExceptionInput = {
      date: MONDAY,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: "12:00",
      endTime: "14:00",
    }
    const windows = resolveDayWindows(MONDAY, [rule(1, "09:00", "17:00")], [ex])
    expect(windows).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:00" },
    ])
  })

  it("recurring weekday exception blocks the matching weekday", () => {
    const ex: ExceptionInput = {
      date: null,
      dayOfWeek: 1,
      isRecurring: true,
      isAvailable: false,
      startTime: null,
      endTime: null,
    }
    expect(resolveDayWindows(MONDAY, [rule(1, "09:00", "17:00")], [ex])).toEqual([])
  })

  it("clinic-wide exception (modeled as a date exception) removes slots", () => {
    // Clinic-wide exceptions are passed in the same list by the caller.
    const ex: ExceptionInput = {
      date: MONDAY,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: null,
      endTime: null,
    }
    expect(resolveDayWindows(MONDAY, [rule(1, "09:00", "17:00")], [ex])).toEqual([])
  })

  it("isAvailable=true adds an extra window even without a weekly rule", () => {
    const ex: ExceptionInput = {
      date: MONDAY,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: true,
      startTime: "18:00",
      endTime: "20:00",
    }
    expect(resolveDayWindows(MONDAY, [], [ex])).toEqual([{ start: "18:00", end: "20:00" }])
  })
})

describe("generateCandidates", () => {
  it("steps by duration + buffer anchored at window start", () => {
    const slots = generateCandidates([{ start: "09:00", end: "17:00" }], MONDAY, 50, 10)
    expect(slots.map((s) => s.label)).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
    ])
  })

  it("discards a candidate whose session does not fit the window", () => {
    // 09:00-09:50 fits; the next at 10:00 needs to end 10:50 but window ends 10:30.
    const slots = generateCandidates([{ start: "09:00", end: "10:30" }], MONDAY, 50, 10)
    expect(slots.map((s) => s.label)).toEqual(["09:00"])
  })

  it("emits ISO UTC start/end converted from São Paulo", () => {
    const slots = generateCandidates([{ start: "09:00", end: "09:50" }], MONDAY, 50, 10)
    expect(slots[0].start).toBe("2026-06-15T12:00:00.000Z")
    expect(slots[0].end).toBe("2026-06-15T12:50:00.000Z")
  })
})

describe("computeFreeSlots", () => {
  it("removes a slot overlapping a busy interval", () => {
    const input = baseInput({
      rules: [rule(1, "09:00", "11:00")],
      busy: [{ start: spToUtc(MONDAY, "09:00"), end: spToUtc(MONDAY, "09:50") }],
    })
    const labels = computeFreeSlots(input)[0].slots.map((s) => s.label)
    expect(labels).toEqual(["10:00"])
  })

  it("allows a back-to-back slot when busy ends exactly at slot start", () => {
    const input = baseInput({
      rules: [rule(1, "09:00", "11:00")],
      // Busy 09:00-10:00 → the 10:00 slot starts where busy ends; allowed.
      busy: [{ start: spToUtc(MONDAY, "09:00"), end: spToUtc(MONDAY, "10:00") }],
    })
    const labels = computeFreeSlots(input)[0].slots.map((s) => s.label)
    expect(labels).toEqual(["10:00"])
  })

  it("minAdvanceHours cuts slots too soon from now", () => {
    const input = baseInput({
      rules: [rule(1, "09:00", "12:00")],
      // now = 08:00 SP (11:00Z). minAdvance 2h → earliest bookable 13:00Z = 10:00 SP.
      now: new Date("2026-06-15T11:00:00.000Z"),
      minAdvanceHours: 2,
    })
    const labels = computeFreeSlots(input)[0].slots.map((s) => s.label)
    // 09:00 SP (12:00Z) is before earliest; 10:00 and 11:00 remain.
    expect(labels).toEqual(["10:00", "11:00"])
  })

  it("horizonDays cuts slots beyond the horizon", () => {
    const input = baseInput({
      rules: [rule(1, "09:00", "10:00"), rule(2, "09:00", "10:00")],
      from: MONDAY,
      days: 2,
      now: new Date("2026-06-15T00:00:00.000Z"),
      // Horizon 0 days → nothing in the future is bookable.
      minAdvanceHours: 0,
      horizonDays: 0,
    })
    const days = computeFreeSlots(input)
    expect(days.every((d) => d.slots.length === 0)).toBe(true)
  })

  it("groups a multi-day window into one DaySlots per day", () => {
    const input = baseInput({
      rules: [rule(1, "09:00", "10:00"), rule(2, "09:00", "10:00")],
      from: MONDAY,
      days: 3, // Mon, Tue, Wed
    })
    const days = computeFreeSlots(input)
    expect(days.map((d) => d.date)).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"])
    expect(days[0].slots.length).toBe(1) // Monday has a rule
    expect(days[1].slots.length).toBe(1) // Tuesday has a rule
    expect(days[2].slots.length).toBe(0) // Wednesday (weekday 3) has none
  })

  it("handles two rules on the same day producing two window grids", () => {
    const input = baseInput({
      rules: [rule(1, "09:00", "10:00"), rule(1, "14:00", "15:00")],
    })
    const labels = computeFreeSlots(input)[0].slots.map((s) => s.label)
    expect(labels).toEqual(["09:00", "14:00"])
  })
})
