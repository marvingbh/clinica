import { describe, it, expect, vi, afterEach } from "vitest"
import { checkAiCredits, getUtcMonthRange, parseMonthParam } from "./credits"

describe("checkAiCredits", () => {
  it("blocks with an upgrade message when planCredits is 0", () => {
    const r = checkAiCredits({ planCredits: 0, usedThisMonth: 0 })
    expect(r.allowed).toBe(false)
    expect(r.message).toMatch(/não inclui o assistente de IA/)
  })

  it("allows with remaining null when unlimited (-1)", () => {
    const r = checkAiCredits({ planCredits: -1, usedThisMonth: 9999 })
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBeNull()
  })

  it("allows with correct remaining when below the limit", () => {
    const r = checkAiCredits({ planCredits: 10, usedThisMonth: 3 })
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(7)
  })

  it("blocks when used === limit", () => {
    const r = checkAiCredits({ planCredits: 10, usedThisMonth: 10 })
    expect(r.allowed).toBe(false)
    expect(r.message).toMatch(/limite de 10 gerações/)
  })

  it("blocks when used > limit", () => {
    const r = checkAiCredits({ planCredits: 10, usedThisMonth: 12 })
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })
})

describe("getUtcMonthRange", () => {
  afterEach(() => vi.useRealTimers())

  it("computes the month range at end of year (31/12 23:59 UTC)", () => {
    const now = new Date("2026-12-31T23:59:00.000Z")
    const { start, end } = getUtcMonthRange(now)
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("computes the month range at start of year (01/01 00:00 UTC)", () => {
    const now = new Date("2027-01-01T00:00:00.000Z")
    const { start, end } = getUtcMonthRange(now)
    expect(start.toISOString()).toBe("2027-01-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2027-02-01T00:00:00.000Z")
  })

  it("works with fake timers mid-month", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"))
    const { start, end } = getUtcMonthRange(new Date())
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2026-07-01T00:00:00.000Z")
  })
})

describe("parseMonthParam", () => {
  const now = new Date("2026-06-15T12:00:00.000Z")

  it("parses a valid YYYY-MM", () => {
    const { start, end } = parseMonthParam("2026-03", now)
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z")
    expect(end.toISOString()).toBe("2026-04-01T00:00:00.000Z")
  })

  it("falls back to the current month for null", () => {
    const { start } = parseMonthParam(null, now)
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("falls back for malformed input", () => {
    expect(parseMonthParam("garbage", now).start.toISOString()).toBe("2026-06-01T00:00:00.000Z")
    expect(parseMonthParam("2026-13", now).start.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })
})
