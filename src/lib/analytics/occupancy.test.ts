import { describe, it, expect } from "vitest"
import {
  availableMinutes,
  bookedMinutes,
  occupancyRate,
  type AvailabilityRuleSlim,
  type AvailabilityExceptionSlim,
  type BookedSlot,
} from "./occupancy"
import type { DateRange } from "./types"

// Helper: a UTC instant for a given local (UTC-3) wall clock.
function localUtc(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  // local = UTC-3, so UTC = local + 3h
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi))
}

// A range covering exactly one local week: Mon 2026-05-04 .. Mon 2026-05-11.
const weekRange: DateRange = {
  start: localUtc(2026, 5, 4), // Monday 00:00 local
  end: localUtc(2026, 5, 11), // next Monday 00:00 local
}

function rule(dayOfWeek: number, startTime: string, endTime: string, isActive = true): AvailabilityRuleSlim {
  return { dayOfWeek, startTime, endTime, isActive }
}

describe("availableMinutes", () => {
  it("expands a single weekly rule across the range", () => {
    // Monday (dow 1) 09:00-12:00 = 180 min, once in the week.
    const mins = availableMinutes([rule(1, "09:00", "12:00")], [], weekRange)
    expect(mins).toBe(180)
  })

  it("ignores inactive rules", () => {
    const mins = availableMinutes([rule(1, "09:00", "12:00", false)], [], weekRange)
    expect(mins).toBe(0)
  })

  it("sums multiple rules on the same weekday (union, no double count)", () => {
    const mins = availableMinutes(
      [rule(1, "09:00", "12:00"), rule(1, "14:00", "16:00")],
      [],
      weekRange
    )
    expect(mins).toBe(180 + 120)
  })

  it("merges overlapping rules without double counting", () => {
    const mins = availableMinutes(
      [rule(1, "09:00", "12:00"), rule(1, "11:00", "13:00")],
      [],
      weekRange
    )
    expect(mins).toBe(240) // 09:00-13:00
  })

  it("subtracts a full-day specific-date exception", () => {
    const monday = localUtc(2026, 5, 4)
    const ex: AvailabilityExceptionSlim = {
      date: monday,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: null,
      endTime: null,
    }
    const mins = availableMinutes([rule(1, "09:00", "12:00")], [ex], weekRange)
    expect(mins).toBe(0)
  })

  it("subtracts only the intersection of a partial exception", () => {
    const monday = localUtc(2026, 5, 4)
    const ex: AvailabilityExceptionSlim = {
      date: monday,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: "10:00",
      endTime: "11:00",
    }
    // 09:00-12:00 (180) minus 10:00-11:00 (60) = 120
    const mins = availableMinutes([rule(1, "09:00", "12:00")], [ex], weekRange)
    expect(mins).toBe(120)
  })

  it("applies a recurring weekday block", () => {
    const ex: AvailabilityExceptionSlim = {
      date: null,
      dayOfWeek: 1, // Monday
      isRecurring: true,
      isAvailable: false,
      startTime: "09:00",
      endTime: "10:00",
    }
    const mins = availableMinutes([rule(1, "09:00", "12:00")], [ex], weekRange)
    expect(mins).toBe(120) // 180 - 60
  })

  it("treats a clinic-wide full-day exception (passed in) as a holiday for everyone", () => {
    const monday = localUtc(2026, 5, 4)
    const holiday: AvailabilityExceptionSlim = {
      date: monday,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: null,
      endTime: null,
    }
    const mins = availableMinutes([rule(1, "09:00", "12:00")], [holiday], weekRange)
    expect(mins).toBe(0)
  })

  it("adds extra availability via isAvailable=true even without a weekly rule", () => {
    const saturday = localUtc(2026, 5, 9) // Saturday
    const ex: AvailabilityExceptionSlim = {
      date: saturday,
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: true,
      startTime: "08:00",
      endTime: "10:00",
    }
    const mins = availableMinutes([], [ex], weekRange)
    expect(mins).toBe(120)
  })

  it("caps counting at todayCap (future days excluded)", () => {
    // Two weekly slots: Monday and Wednesday. Cap at Tuesday → only Monday counts.
    const rules = [rule(1, "09:00", "12:00"), rule(3, "09:00", "12:00")]
    const tuesday = localUtc(2026, 5, 5, 12) // midday Tuesday local
    const mins = availableMinutes(rules, [], weekRange, tuesday)
    expect(mins).toBe(180) // only Monday
  })
})

describe("bookedMinutes", () => {
  it("sums individual session durations", () => {
    const slots: BookedSlot[] = [
      { scheduledAt: localUtc(2026, 5, 4, 9), endAt: localUtc(2026, 5, 4, 10), groupKey: null },
      { scheduledAt: localUtc(2026, 5, 4, 10), endAt: localUtc(2026, 5, 4, 11), groupKey: null },
    ]
    expect(bookedMinutes(slots)).toBe(120)
  })

  it("dedupes a group session block across members", () => {
    const start = localUtc(2026, 5, 4, 14)
    const end = localUtc(2026, 5, 4, 15, 30)
    const slots: BookedSlot[] = [
      { scheduledAt: start, endAt: end, groupKey: "group-1" },
      { scheduledAt: start, endAt: end, groupKey: "group-1" },
      { scheduledAt: start, endAt: end, groupKey: "group-1" },
    ]
    expect(bookedMinutes(slots)).toBe(90) // counted once
  })

  it("counts distinct group sessions separately", () => {
    const slots: BookedSlot[] = [
      { scheduledAt: localUtc(2026, 5, 4, 14), endAt: localUtc(2026, 5, 4, 15), groupKey: "g1" },
      { scheduledAt: localUtc(2026, 5, 5, 14), endAt: localUtc(2026, 5, 5, 15), groupKey: "g1" },
    ]
    expect(bookedMinutes(slots)).toBe(120)
  })
})

describe("occupancyRate", () => {
  it("returns null when no availability is configured", () => {
    expect(occupancyRate(120, 0)).toBeNull()
  })

  it("computes a fraction", () => {
    expect(occupancyRate(90, 180)).toBe(0.5)
  })

  it("can exceed 1 (above the grid)", () => {
    expect(occupancyRate(240, 180)).toBeCloseTo(1.333, 3)
  })
})
