import { describe, it, expect } from "vitest"
import {
  clampRetentionYears,
  retentionDeadline,
  canDispose,
  formatRetentionBanner,
} from "./retention"

describe("clampRetentionYears", () => {
  it("clamps below 5 up to 5", () => {
    expect(clampRetentionYears(3)).toBe(5)
  })
  it("clamps above 20 down to 20", () => {
    expect(clampRetentionYears(25)).toBe(20)
  })
  it("keeps values within range", () => {
    expect(clampRetentionYears(10)).toBe(10)
  })
})

describe("retentionDeadline", () => {
  it("adds the years", () => {
    const closed = new Date("2026-06-11T00:00:00.000Z")
    expect(retentionDeadline(closed, 5).toISOString()).toBe("2031-06-11T00:00:00.000Z")
  })

  it("clamps Feb 29 to Feb 28 in a non-leap target year", () => {
    const closed = new Date("2024-02-29T00:00:00.000Z")
    const deadline = retentionDeadline(closed, 5) // 2029 is not leap
    expect(deadline.getUTCMonth()).toBe(1) // February
    expect(deadline.getUTCDate()).toBe(28)
    expect(deadline.getUTCFullYear()).toBe(2029)
  })
})

describe("canDispose", () => {
  it("returns NOT_CLOSED when record is not closed", () => {
    expect(canDispose(null, 5, new Date("2030-01-01T00:00:00Z"))).toEqual({
      ok: false,
      reason: "NOT_CLOSED",
    })
  })

  it("returns WITHIN_RETENTION before the deadline", () => {
    const closed = new Date("2026-06-11T00:00:00Z")
    expect(canDispose(closed, 5, new Date("2030-01-01T00:00:00Z"))).toEqual({
      ok: false,
      reason: "WITHIN_RETENTION",
    })
  })

  it("returns ok after the deadline", () => {
    const closed = new Date("2026-06-11T00:00:00Z")
    expect(canDispose(closed, 5, new Date("2031-06-12T00:00:00Z"))).toEqual({ ok: true })
  })
})

describe("formatRetentionBanner", () => {
  it("formats DD/MM/YYYY with years remaining", () => {
    const closed = new Date("2026-06-11T00:00:00Z")
    const banner = formatRetentionBanner(closed, 5, new Date("2027-06-11T00:00:00Z"))
    expect(banner).toContain("11/06/2026")
    expect(banner).toContain("11/06/2031")
    expect(banner).toMatch(/anos restantes/)
  })

  it("announces disposal release once the deadline passed", () => {
    const closed = new Date("2026-06-11T00:00:00Z")
    const banner = formatRetentionBanner(closed, 5, new Date("2032-01-01T00:00:00Z"))
    expect(banner).toMatch(/liberado/i)
  })
})
