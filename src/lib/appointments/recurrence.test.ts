// src/lib/appointments/recurrence.test.ts
import { describe, it, expect } from "vitest"
import {
  validateRecurrenceOptions,
  calculateRecurrenceDates,
  calculateNextWindowDates,
  formatRecurrenceSummary,
  formatDate,
  isDateException,
  addException,
  removeException,
  calculateRecurrenceDatesWithExceptions,
  countActiveOccurrences,
  calculateDayShiftedDates,
  isOffWeek,
} from "./recurrence"

// Prisma enums are plain strings at runtime
const RecurrenceType = { WEEKLY: "WEEKLY", BIWEEKLY: "BIWEEKLY", MONTHLY: "MONTHLY" } as const
const RecurrenceEndType = { BY_DATE: "BY_DATE", BY_OCCURRENCES: "BY_OCCURRENCES", INDEFINITE: "INDEFINITE" } as const

describe("formatDate", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(formatDate(new Date(2026, 11, 31))).toBe("2026-12-31")
  })

  it("pads single-digit month and day", () => {
    expect(formatDate(new Date(2026, 2, 3))).toBe("2026-03-03")
  })
})

describe("validateRecurrenceOptions", () => {
  it("validates BY_OCCURRENCES requires occurrences >= 1", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 0,
      })
    ).toEqual({ valid: false, error: expect.stringContaining("pelo menos 1") })
  })

  it("validates BY_OCCURRENCES max is 52", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 53,
      })
    ).toEqual({ valid: false, error: expect.stringContaining("52") })
  })

  it("validates BY_OCCURRENCES accepts valid count", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 10,
      })
    ).toEqual({ valid: true })
  })

  it("validates BY_DATE requires endDate", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_DATE,
      })
    ).toEqual({ valid: false, error: expect.stringContaining("Data final") })
  })

  it("validates BY_DATE rejects invalid date", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_DATE,
        endDate: "not-a-date",
      })
    ).toEqual({ valid: false, error: expect.stringContaining("invalida") })
  })

  it("validates INDEFINITE requires nothing extra", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.INDEFINITE,
      })
    ).toEqual({ valid: true })
  })
})

describe("calculateRecurrenceDates", () => {
  describe("WEEKLY", () => {
    it("generates correct number of weekly occurrences", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "09:00", 45, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 4,
      })
      expect(dates).toHaveLength(4)
      expect(dates.map((d) => d.date)).toEqual([
        "2026-03-02",
        "2026-03-09",
        "2026-03-16",
        "2026-03-23",
      ])
    })

    it("sets correct scheduledAt and endAt times", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "14:30", 60, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 1,
      })
      expect(dates[0].scheduledAt.getHours()).toBe(14)
      expect(dates[0].scheduledAt.getMinutes()).toBe(30)
      expect(dates[0].endAt.getHours()).toBe(15)
      expect(dates[0].endAt.getMinutes()).toBe(30)
    })
  })

  describe("BIWEEKLY", () => {
    it("generates dates 14 days apart", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "10:00", 45, {
        recurrenceType: RecurrenceType.BIWEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      })
      expect(dates.map((d) => d.date)).toEqual([
        "2026-03-02",
        "2026-03-16",
        "2026-03-30",
      ])
    })
  })

  describe("MONTHLY", () => {
    it("generates dates on same day of month", () => {
      const dates = calculateRecurrenceDates("2026-01-15", "09:00", 45, {
        recurrenceType: RecurrenceType.MONTHLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      })
      expect(dates.map((d) => d.date)).toEqual([
        "2026-01-15",
        "2026-02-15",
        "2026-03-15",
      ])
    })

    it("handles month-end edge case (Jan 31 -> Feb 28)", () => {
      const dates = calculateRecurrenceDates("2026-01-31", "09:00", 45, {
        recurrenceType: RecurrenceType.MONTHLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      })
      expect(dates[0].date).toBe("2026-01-31")
      expect(dates[1].date).toBe("2026-02-28") // Feb has 28 days in 2026
      expect(dates[2].date).toBe("2026-03-31")
    })
  })

  describe("BY_DATE end type", () => {
    it("stops generating when past endDate", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "09:00", 45, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_DATE,
        endDate: "2026-03-20",
      })
      // Mar 2, 9, 16 are within range; Mar 23 is past
      expect(dates).toHaveLength(3)
      expect(dates.map((d) => d.date)).toEqual([
        "2026-03-02",
        "2026-03-09",
        "2026-03-16",
      ])
    })
  })

  describe("INDEFINITE end type", () => {
    it("generates within 6-month rolling window", () => {
      const dates = calculateRecurrenceDates("2026-01-05", "09:00", 45, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.INDEFINITE,
      })
      // Should have ~26 weeks (6 months)
      expect(dates.length).toBeGreaterThan(20)
      expect(dates.length).toBeLessThanOrEqual(52)

      // Last date should be before July 5, 2026
      const lastDate = new Date(dates[dates.length - 1].date + "T12:00:00")
      expect(lastDate.getTime()).toBeLessThanOrEqual(
        new Date("2026-07-06T00:00:00").getTime()
      )
    })
  })

  it("caps at 52 occurrences maximum", () => {
    const dates = calculateRecurrenceDates("2026-01-05", "09:00", 45, {
      recurrenceType: RecurrenceType.WEEKLY,
      recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
      occurrences: 100,
    })
    expect(dates.length).toBeLessThanOrEqual(52)
  })
})

describe("calculateNextWindowDates", () => {
  it("generates weekly dates from last generated date", () => {
    const dates = calculateNextWindowDates(
      "2026-03-02", // Monday
      "09:00",
      45,
      RecurrenceType.WEEKLY,
      1, // Monday
      1  // 1 month extension
    )
    expect(dates.length).toBeGreaterThan(0)
    // All dates should be Mondays
    dates.forEach((d) => {
      const date = new Date(d.date + "T12:00:00")
      expect(date.getDay()).toBe(1)
    })
  })

  it("only includes dates matching dayOfWeek", () => {
    // Start from a Wednesday so that weekly intervals land on Wednesdays
    const dates = calculateNextWindowDates(
      "2026-03-04", // Wednesday
      "09:00",
      45,
      RecurrenceType.WEEKLY,
      3, // Wednesday
      1
    )
    expect(dates.length).toBeGreaterThan(0)
    dates.forEach((d) => {
      const date = new Date(d.date + "T12:00:00")
      expect(date.getDay()).toBe(3)
    })
  })
})

describe("exception management", () => {
  const exceptions = ["2026-03-09", "2026-03-16"]

  describe("isDateException", () => {
    it("returns true for dates in exceptions list", () => {
      expect(isDateException("2026-03-09", exceptions)).toBe(true)
    })

    it("returns false for dates not in list", () => {
      expect(isDateException("2026-03-02", exceptions)).toBe(false)
    })

    it("accepts Date objects", () => {
      expect(isDateException(new Date(2026, 2, 9), exceptions)).toBe(true)
    })
  })

  describe("addException", () => {
    it("adds a new date and returns sorted array", () => {
      const result = addException("2026-03-01", exceptions)
      expect(result).toEqual(["2026-03-01", "2026-03-09", "2026-03-16"])
    })

    it("does not duplicate existing exceptions", () => {
      const result = addException("2026-03-09", exceptions)
      expect(result).toEqual(exceptions)
    })
  })

  describe("removeException", () => {
    it("removes the date from the list", () => {
      const result = removeException("2026-03-09", exceptions)
      expect(result).toEqual(["2026-03-16"])
    })

    it("returns same content if date not found", () => {
      const result = removeException("2026-03-01", exceptions)
      expect(result).toEqual(exceptions)
    })
  })
})

describe("calculateRecurrenceDatesWithExceptions", () => {
  it("marks exception dates with isException=true", () => {
    const dates = calculateRecurrenceDatesWithExceptions(
      "2026-03-02",
      "09:00",
      45,
      {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      },
      ["2026-03-09"]
    )
    expect(dates[0].isException).toBe(false)
    expect(dates[1].isException).toBe(true)
    expect(dates[2].isException).toBe(false)
  })
})

describe("countActiveOccurrences", () => {
  it("excludes exception dates from count", () => {
    const count = countActiveOccurrences(
      "2026-03-02",
      "09:00",
      45,
      {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 4,
      },
      ["2026-03-09", "2026-03-16"]
    )
    expect(count).toBe(2)
  })
})

describe("calculateDayShiftedDates", () => {
  it("shifts forward to next occurrence of new day", () => {
    // Monday Mar 2 -> Wednesday Mar 4 (+2 days)
    const monday = new Date(2026, 2, 2, 9, 0)
    const mondayEnd = new Date(2026, 2, 2, 9, 45)

    const { scheduledAt, endAt } = calculateDayShiftedDates(monday, mondayEnd, 1, 3)
    expect(scheduledAt.getDay()).toBe(3)
    expect(scheduledAt.getDate()).toBe(4)
    expect(scheduledAt.getHours()).toBe(9)
    expect(endAt.getDate()).toBe(4)
  })

  it("shifts to next week when new day is same as current", () => {
    const monday = new Date(2026, 2, 2, 9, 0)
    const mondayEnd = new Date(2026, 2, 2, 9, 45)

    const { scheduledAt } = calculateDayShiftedDates(monday, mondayEnd, 1, 1)
    expect(scheduledAt.getDate()).toBe(9)
  })

  it("shifts to next week when new day is earlier in week", () => {
    // Wednesday -> Monday = +5 days (not -2)
    const wednesday = new Date(2026, 2, 4, 9, 0)
    const wednesdayEnd = new Date(2026, 2, 4, 9, 45)

    const { scheduledAt } = calculateDayShiftedDates(wednesday, wednesdayEnd, 3, 1)
    expect(scheduledAt.getDay()).toBe(1)
    expect(scheduledAt.getDate()).toBe(9)
  })

  it("preserves time across the shift", () => {
    const fri = new Date(2026, 2, 6, 14, 30)
    const friEnd = new Date(2026, 2, 6, 15, 15)

    const { scheduledAt, endAt } = calculateDayShiftedDates(fri, friEnd, 5, 2)
    expect(scheduledAt.getHours()).toBe(14)
    expect(scheduledAt.getMinutes()).toBe(30)
    expect(endAt.getHours()).toBe(15)
    expect(endAt.getMinutes()).toBe(15)
  })
})

describe("formatRecurrenceSummary", () => {
  it("formats weekly with occurrences", () => {
    const summary = formatRecurrenceSummary(
      RecurrenceType.WEEKLY,
      RecurrenceEndType.BY_OCCURRENCES,
      10
    )
    expect(summary).toBe("Semanal - 10 sessoes")
  })

  it("formats biweekly with end date", () => {
    const summary = formatRecurrenceSummary(
      RecurrenceType.BIWEEKLY,
      RecurrenceEndType.BY_DATE,
      undefined,
      "2026-06-30"
    )
    expect(summary).toContain("Quinzenal")
    expect(summary).toContain("ate")
  })

  it("formats monthly indefinite", () => {
    const summary = formatRecurrenceSummary(
      RecurrenceType.MONTHLY,
      RecurrenceEndType.INDEFINITE
    )
    expect(summary).toBe("Mensal - sem data de fim")
  })
})

describe("isOffWeek", () => {
  // Recurrence starts 2026-03-02 (Monday), so "on" weeks are 0, 2, 4... from that date
  const startDate = new Date("2026-03-02") // stored as @db.Date → midnight UTC

  it("returns false for the start date itself (week 0 = on week)", () => {
    expect(isOffWeek(startDate, "2026-03-02")).toBe(false)
  })

  it("returns true for +1 week (off week)", () => {
    expect(isOffWeek(startDate, "2026-03-09")).toBe(true)
  })

  it("returns false for +2 weeks (on week)", () => {
    expect(isOffWeek(startDate, "2026-03-16")).toBe(false)
  })

  it("returns true for +3 weeks (off week)", () => {
    expect(isOffWeek(startDate, "2026-03-23")).toBe(true)
  })

  it("returns false for +4 weeks (on week)", () => {
    expect(isOffWeek(startDate, "2026-03-30")).toBe(false)
  })

  it("returns true for -1 week (off week, before start)", () => {
    expect(isOffWeek(startDate, "2026-02-23")).toBe(true)
  })

  it("returns false for -2 weeks (on week, before start)", () => {
    expect(isOffWeek(startDate, "2026-02-16")).toBe(false)
  })

  it("works for dates far in the future", () => {
    // +52 weeks (even) = on week
    expect(isOffWeek(startDate, "2027-03-01")).toBe(false)
    // +53 weeks (odd) = off week
    expect(isOffWeek(startDate, "2027-03-08")).toBe(true)
  })

  it("handles different day within the same week as start", () => {
    // 2026-03-04 is Wednesday same week as start (Wed of week 0) → on week
    expect(isOffWeek(startDate, "2026-03-04")).toBe(false)
    // 2026-03-11 is Wednesday of week 1 → off week
    expect(isOffWeek(startDate, "2026-03-11")).toBe(true)
  })
})
