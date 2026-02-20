import { describe, it, expect } from "vitest"
import { calculateNextRetryDelay, DEFAULT_RETRY_CONFIG } from "./types"

describe("calculateNextRetryDelay", () => {
  it("returns baseDelay for attempt 1", () => {
    expect(calculateNextRetryDelay(1)).toBe(60000) // 1 min
  })

  it("doubles delay for each subsequent attempt", () => {
    expect(calculateNextRetryDelay(2)).toBe(120000) // 2 min
    expect(calculateNextRetryDelay(3)).toBe(240000) // 4 min
    expect(calculateNextRetryDelay(4)).toBe(480000) // 8 min
  })

  it("caps at maxDelayMs", () => {
    // 60000 * 2^(6-1) = 1,920,000 (not yet capped)
    expect(calculateNextRetryDelay(6)).toBe(1920000)
    // 60000 * 2^(7-1) = 3,840,000 > 3,600,000 → capped
    expect(calculateNextRetryDelay(7)).toBe(3600000)
    expect(calculateNextRetryDelay(10)).toBe(3600000)
  })

  it("uses custom config when provided", () => {
    const config = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 5000 }
    expect(calculateNextRetryDelay(1, config)).toBe(1000)
    expect(calculateNextRetryDelay(2, config)).toBe(2000)
    expect(calculateNextRetryDelay(3, config)).toBe(4000)
    expect(calculateNextRetryDelay(4, config)).toBe(5000) // capped
  })
})

describe("DEFAULT_RETRY_CONFIG", () => {
  it("has expected defaults", () => {
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3)
    expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(60000)
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(3600000)
  })
})
