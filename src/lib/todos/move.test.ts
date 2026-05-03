import { describe, it, expect } from "vitest"
import { todayIso, addDays, nextWeekIso, tomorrowIso } from "./move"

describe("todos/move", () => {
  it("formats today as YYYY-MM-DD in local time", () => {
    const fixed = new Date(2026, 4, 3, 10, 30) // 2026-05-03 local
    expect(todayIso(fixed)).toBe("2026-05-03")
  })

  it("addDays handles forward and backward shifts", () => {
    expect(addDays("2026-05-03", 1)).toBe("2026-05-04")
    expect(addDays("2026-05-03", 7)).toBe("2026-05-10")
    expect(addDays("2026-05-03", -3)).toBe("2026-04-30")
  })

  it("addDays rolls over month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01") // non-leap
  })

  it("nextWeekIso adds exactly 7 days", () => {
    expect(nextWeekIso("2026-05-03")).toBe("2026-05-10")
  })

  it("tomorrowIso is one day after today", () => {
    const fixed = new Date(2026, 4, 3, 10, 30)
    expect(tomorrowIso(fixed)).toBe("2026-05-04")
  })
})
