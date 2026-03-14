import { describe, it, expect } from "vitest"
import { minutesToPixel, minutesToTime, formatTimeFromMinutes, findVisualOverlaps } from "./grid-geometry"
import { WEEKLY_GRID } from "./grid-config"

describe("minutesToPixel", () => {
  it("returns 0 for startHour", () => {
    expect(minutesToPixel(7 * 60, WEEKLY_GRID)).toBe(0)
  })

  it("returns hourHeight for startHour + 60", () => {
    // (480 - 420) * 1.6 = 96
    expect(minutesToPixel(8 * 60, WEEKLY_GRID)).toBe(96)
  })

  it("returns negative for times before startHour", () => {
    expect(minutesToPixel(6 * 60, WEEKLY_GRID)).toBeLessThan(0)
  })
})

describe("minutesToTime", () => {
  it("converts 540 to 9:00", () => {
    expect(minutesToTime(540)).toEqual({ hours: 9, minutes: 0 })
  })

  it("converts 495 to 8:15", () => {
    expect(minutesToTime(495)).toEqual({ hours: 8, minutes: 15 })
  })

  it("clamps negative to 0:00", () => {
    expect(minutesToTime(-10)).toEqual({ hours: 0, minutes: 0 })
  })
})

describe("formatTimeFromMinutes", () => {
  it("formats 540 as 09:00", () => {
    expect(formatTimeFromMinutes(540)).toBe("09:00")
  })

  it("formats 495 as 08:15", () => {
    expect(formatTimeFromMinutes(495)).toBe("08:15")
  })

  it("pads single-digit hours", () => {
    expect(formatTimeFromMinutes(60)).toBe("01:00")
  })
})

describe("findVisualOverlaps", () => {
  const intervals = [
    { id: "a", startMs: 1000, endMs: 2000 },
    { id: "b", startMs: 1500, endMs: 2500 },
    { id: "c", startMs: 3000, endMs: 4000 },
  ]

  it("finds overlapping intervals", () => {
    const result = findVisualOverlaps(1800, 3200, intervals)
    expect(result).toContain("a")
    expect(result).toContain("b")
    expect(result).toContain("c")
  })

  it("returns empty when no overlaps", () => {
    const result = findVisualOverlaps(5000, 6000, intervals)
    expect(result).toEqual([])
  })

  it("excludes the specified ID", () => {
    const result = findVisualOverlaps(1800, 2200, intervals, "a")
    expect(result).not.toContain("a")
    expect(result).toContain("b")
  })

  it("handles exact boundary (touching but not overlapping)", () => {
    const result = findVisualOverlaps(2800, 3000, intervals)
    expect(result).not.toContain("c")
  })
})
