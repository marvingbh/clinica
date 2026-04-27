import { describe, it, expect } from "vitest"
import { computeHourRange } from "./hour-range"

const DEFAULTS = { startHour: 8, endHour: 18 }

function block(scheduledAt: string, endAt: string) {
  return { scheduledAt, endAt }
}

describe("computeHourRange", () => {
  it("returns the defaults when there are no blocks", () => {
    expect(computeHourRange([], DEFAULTS)).toEqual(DEFAULTS)
  })

  it("keeps the defaults when all blocks fall within them", () => {
    const blocks = [block("2026-04-27T09:00:00", "2026-04-27T10:00:00")]
    expect(computeHourRange(blocks, DEFAULTS)).toEqual(DEFAULTS)
  })

  it("expands startHour with 1-hour padding when a block starts before the default", () => {
    const blocks = [block("2026-04-27T06:30:00", "2026-04-27T07:00:00")]
    expect(computeHourRange(blocks, DEFAULTS)).toEqual({ startHour: 5, endHour: 18 })
  })

  it("expands endHour with 1-hour padding when a block ends after the default", () => {
    const blocks = [block("2026-04-27T17:00:00", "2026-04-27T19:30:00")]
    expect(computeHourRange(blocks, DEFAULTS)).toEqual({ startHour: 8, endHour: 21 })
  })

  it("does not pad endHour past the trailing default when minutes are zero", () => {
    const blocks = [block("2026-04-27T17:00:00", "2026-04-27T18:00:00")]
    expect(computeHourRange(blocks, DEFAULTS)).toEqual({ startHour: 8, endHour: 19 })
  })

  it("clamps to [0, 24]", () => {
    const blocks = [block("2026-04-27T00:00:00", "2026-04-27T23:59:00")]
    const range = computeHourRange(blocks, DEFAULTS)
    expect(range.startHour).toBe(0)
    expect(range.endHour).toBe(24)
  })

  it("considers the earliest start across all blocks", () => {
    const blocks = [
      block("2026-04-27T10:00:00", "2026-04-27T11:00:00"),
      block("2026-04-27T06:30:00", "2026-04-27T07:00:00"),
      block("2026-04-27T09:00:00", "2026-04-27T10:00:00"),
    ]
    expect(computeHourRange(blocks, DEFAULTS).startHour).toBe(5)
  })

  it("works with weekly defaults of 7-21", () => {
    const weekly = { startHour: 7, endHour: 21 }
    const blocks = [block("2026-04-27T06:30:00", "2026-04-27T07:30:00")]
    expect(computeHourRange(blocks, weekly)).toEqual({ startHour: 5, endHour: 21 })
  })
})
