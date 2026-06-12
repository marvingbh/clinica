import { describe, it, expect } from "vitest"
import {
  SP_UTC_OFFSET,
  spToUtc,
  utcToSpTime,
  utcToSpDateISO,
  addDaysISO,
  spWeekdayOf,
  parseTimeToMinutes,
  minutesToTime,
  isValidTime,
} from "./timezone"

describe("timezone (America/Sao_Paulo, fixed UTC-3)", () => {
  it("exposes the fixed -03:00 offset", () => {
    expect(SP_UTC_OFFSET).toBe("-03:00")
  })

  describe("spToUtc", () => {
    it("converts a São Paulo wall-clock time to UTC (+3h)", () => {
      const utc = spToUtc("2026-06-15", "14:00")
      expect(utc.toISOString()).toBe("2026-06-15T17:00:00.000Z")
    })

    it("handles midnight", () => {
      expect(spToUtc("2026-01-01", "00:00").toISOString()).toBe("2026-01-01T03:00:00.000Z")
    })
  })

  describe("round-trip utcToSpTime / utcToSpDateISO", () => {
    it("recovers the original SP wall clock", () => {
      const utc = spToUtc("2026-06-15", "09:30")
      expect(utcToSpTime(utc)).toBe("09:30")
      expect(utcToSpDateISO(utc)).toBe("2026-06-15")
    })

    it("a late SP time stays on the same SP date despite UTC roll-over", () => {
      // 22:00 SP = 01:00 UTC next day, but the SP date must remain the 15th.
      const utc = spToUtc("2026-06-15", "22:00")
      expect(utc.toISOString()).toBe("2026-06-16T01:00:00.000Z")
      expect(utcToSpDateISO(utc)).toBe("2026-06-15")
      expect(utcToSpTime(utc)).toBe("22:00")
    })
  })

  describe("addDaysISO", () => {
    it("adds days within a month", () => {
      expect(addDaysISO("2026-06-15", 3)).toBe("2026-06-18")
    })

    it("rolls over a month boundary", () => {
      expect(addDaysISO("2026-06-29", 3)).toBe("2026-07-02")
    })

    it("rolls over a year boundary", () => {
      expect(addDaysISO("2026-12-30", 5)).toBe("2027-01-04")
    })

    it("subtracts days", () => {
      expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28")
    })
  })

  describe("spWeekdayOf", () => {
    it("returns the correct weekday for known dates", () => {
      // 2026-06-15 is a Monday.
      expect(spWeekdayOf("2026-06-15")).toBe(1)
      // 2026-06-14 is a Sunday.
      expect(spWeekdayOf("2026-06-14")).toBe(0)
      // 2026-06-20 is a Saturday.
      expect(spWeekdayOf("2026-06-20")).toBe(6)
    })
  })

  describe("parseTimeToMinutes / minutesToTime", () => {
    it("parses and formats round-trip", () => {
      expect(parseTimeToMinutes("09:30")).toBe(570)
      expect(minutesToTime(570)).toBe("09:30")
      expect(minutesToTime(0)).toBe("00:00")
    })
  })

  describe("isValidTime", () => {
    it("accepts valid HH:mm", () => {
      expect(isValidTime("00:00")).toBe(true)
      expect(isValidTime("23:59")).toBe(true)
    })
    it("rejects malformed times", () => {
      expect(isValidTime("9:00")).toBe(false)
      expect(isValidTime("abc")).toBe(false)
    })
  })
})
