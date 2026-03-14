import { describe, it, expect } from "vitest"
import { pixelToMinutes, minutesToPixel, minutesToTime, formatTimeFromMinutes, findVisualOverlaps } from "./grid-geometry"
import { WEEKLY_GRID, DAILY_GRID_BASE } from "./grid-config"

describe("pixelToMinutes", () => {
  it("converts 0px to startHour in weekly grid", () => {
    expect(pixelToMinutes(0, WEEKLY_GRID)).toBe(7 * 60) // 420
  })

  it("converts 96px (1 hour) to startHour + 60 in weekly grid", () => {
    // 96px / 1.6 ppm = 60 min → 7*60 + 60 = 480
    expect(pixelToMinutes(96, WEEKLY_GRID)).toBe(480)
  })

  it("snaps to 15-min intervals", () => {
    // 40px / 1.6 = 25 min + 420 = 445 → snaps to 450 (7:30)
    expect(pixelToMinutes(40, WEEKLY_GRID)).toBe(450)
  })

  it("works with daily PPM (2.4)", () => {
    const dailyConfig = { ...DAILY_GRID_BASE, startHour: 8, endHour: 18 }
    // 144px / 2.4 = 60 min + 480 = 540 (9:00)
    expect(pixelToMinutes(144, dailyConfig)).toBe(540)
  })

  it("clamps to 0 at minimum", () => {
    expect(pixelToMinutes(-1000, WEEKLY_GRID)).toBe(0)
  })

  it("clamps to 1439 at maximum", () => {
    expect(pixelToMinutes(100000, WEEKLY_GRID)).toBe(1439)
  })
})

describe("minutesToPixel", () => {
  it("is inverse of pixelToMinutes for exact values", () => {
    const minutes = 480 // 8:00
    const px = minutesToPixel(minutes, WEEKLY_GRID)
    expect(pixelToMinutes(px, WEEKLY_GRID)).toBe(minutes)
  })

  it("returns 0 for startHour", () => {
    expect(minutesToPixel(7 * 60, WEEKLY_GRID)).toBe(0)
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
    // Ends exactly when c starts — no overlap
    const result = findVisualOverlaps(2800, 3000, intervals)
    expect(result).not.toContain("c")
  })
})
