import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "./rate-limit"
import { __resetMemoryStore } from "./rate-limit-memory"

// Tests run under NODE_ENV === "test", so checkRateLimit uses the in-memory
// backend unconditionally. The Upstash code path is exercised at the adapter
// level by integration tests in staging against a real Upstash preview DB.

describe("checkRateLimit (memory backend)", () => {
  beforeEach(() => {
    __resetMemoryStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const config = { maxRequests: 3, windowMs: 60_000 }

  it("allows requests under the limit", async () => {
    const result = await checkRateLimit("test-under-limit", config)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.retryAfter).toBe(0)
  })

  it("tracks remaining count correctly", async () => {
    const r1 = await checkRateLimit("test-remaining", config)
    expect(r1.remaining).toBe(2)

    const r2 = await checkRateLimit("test-remaining", config)
    expect(r2.remaining).toBe(1)

    const r3 = await checkRateLimit("test-remaining", config)
    expect(r3.remaining).toBe(0)
  })

  it("blocks requests over the limit", async () => {
    await checkRateLimit("test-block", config)
    await checkRateLimit("test-block", config)
    await checkRateLimit("test-block", config)

    const result = await checkRateLimit("test-block", config)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it("allows requests again after window expires", async () => {
    await checkRateLimit("test-expire", config)
    await checkRateLimit("test-expire", config)
    await checkRateLimit("test-expire", config)

    const blocked = await checkRateLimit("test-expire", config)
    expect(blocked.allowed).toBe(false)

    vi.advanceTimersByTime(60_001)

    const allowed = await checkRateLimit("test-expire", config)
    expect(allowed.allowed).toBe(true)
  })

  it("uses separate counters per key", async () => {
    await checkRateLimit("key-a", config)
    await checkRateLimit("key-a", config)
    await checkRateLimit("key-a", config)

    const resultA = await checkRateLimit("key-a", config)
    expect(resultA.allowed).toBe(false)

    const resultB = await checkRateLimit("key-b", config)
    expect(resultB.allowed).toBe(true)
  })

  it("retryAfter reflects time until oldest request exits window", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    await checkRateLimit("test-retry", config)
    vi.advanceTimersByTime(10_000)
    await checkRateLimit("test-retry", config)
    vi.advanceTimersByTime(10_000)
    await checkRateLimit("test-retry", config)

    const blocked = await checkRateLimit("test-retry", config)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(40_000)
  })

  it("accepts failMode without affecting in-memory behavior", async () => {
    // Under test env there's no Upstash to fail, so failMode is a no-op here.
    const openResult = await checkRateLimit("failmode-open", { ...config, failMode: "open" })
    const closedResult = await checkRateLimit("failmode-closed", { ...config, failMode: "closed" })
    expect(openResult.allowed).toBe(true)
    expect(closedResult.allowed).toBe(true)
  })
})

describe("RATE_LIMIT_CONFIGS presets", () => {
  it("publicApi: 10/min, fail-open", () => {
    expect(RATE_LIMIT_CONFIGS.publicApi.maxRequests).toBe(10)
    expect(RATE_LIMIT_CONFIGS.publicApi.windowMs).toBe(60_000)
    expect(RATE_LIMIT_CONFIGS.publicApi.failMode).toBe("open")
  })

  it("sensitive: 5/min, fail-open", () => {
    expect(RATE_LIMIT_CONFIGS.sensitive.maxRequests).toBe(5)
    expect(RATE_LIMIT_CONFIGS.sensitive.windowMs).toBe(60_000)
    expect(RATE_LIMIT_CONFIGS.sensitive.failMode).toBe("open")
  })

  it("login: 5 per 15min, fail-closed", () => {
    expect(RATE_LIMIT_CONFIGS.login.maxRequests).toBe(5)
    expect(RATE_LIMIT_CONFIGS.login.windowMs).toBe(15 * 60_000)
    expect(RATE_LIMIT_CONFIGS.login.failMode).toBe("closed")
  })

  it("signup: 3 per hour, fail-closed", () => {
    expect(RATE_LIMIT_CONFIGS.signup.maxRequests).toBe(3)
    expect(RATE_LIMIT_CONFIGS.signup.windowMs).toBe(60 * 60_000)
    expect(RATE_LIMIT_CONFIGS.signup.failMode).toBe("closed")
  })

  it("superadminLogin: 3 per 15min, fail-closed", () => {
    expect(RATE_LIMIT_CONFIGS.superadminLogin.maxRequests).toBe(3)
    expect(RATE_LIMIT_CONFIGS.superadminLogin.windowMs).toBe(15 * 60_000)
    expect(RATE_LIMIT_CONFIGS.superadminLogin.failMode).toBe("closed")
  })
})
