// src/lib/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "./rate-limit"

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const config = { maxRequests: 3, windowMs: 60000 }

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

    // Blocked
    const blocked = await checkRateLimit("test-expire", config)
    expect(blocked.allowed).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(60001)

    const allowed = await checkRateLimit("test-expire", config)
    expect(allowed.allowed).toBe(true)
  })

  it("uses separate counters per key", async () => {
    await checkRateLimit("key-a", config)
    await checkRateLimit("key-a", config)
    await checkRateLimit("key-a", config)

    // key-a is full, key-b should still work
    const resultA = await checkRateLimit("key-a", config)
    expect(resultA.allowed).toBe(false)

    const resultB = await checkRateLimit("key-b", config)
    expect(resultB.allowed).toBe(true)
  })

  it("retryAfter reflects time until oldest request exits window", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    await checkRateLimit("test-retry", config)
    vi.advanceTimersByTime(10000) // +10s
    await checkRateLimit("test-retry", config)
    vi.advanceTimersByTime(10000) // +20s total
    await checkRateLimit("test-retry", config)

    // Now blocked — oldest request was at T+0, window is 60s
    // So retryAfter ≈ 60000 - 20000 = 40000
    const blocked = await checkRateLimit("test-retry", config)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(40000)
  })
})

describe("RATE_LIMIT_CONFIGS", () => {
  it("publicApi allows 10 per minute", () => {
    expect(RATE_LIMIT_CONFIGS.publicApi.maxRequests).toBe(10)
    expect(RATE_LIMIT_CONFIGS.publicApi.windowMs).toBe(60000)
  })

  it("sensitive allows 5 per minute", () => {
    expect(RATE_LIMIT_CONFIGS.sensitive.maxRequests).toBe(5)
    expect(RATE_LIMIT_CONFIGS.sensitive.windowMs).toBe(60000)
  })
})
