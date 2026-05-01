import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { RateLimitUnavailableError, checkWithUpstash, isUpstashConfigured } from "./rate-limit-upstash"

// These tests validate the adapter's guards without hitting real Upstash.
// The actual Upstash delegation path is exercised by staging integration tests.

describe("rate-limit-upstash adapter", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl
    else delete process.env.UPSTASH_REDIS_REST_URL
    if (originalToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
    else delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it("isUpstashConfigured returns false when env is missing", () => {
    expect(isUpstashConfigured()).toBe(false)
  })

  it("isUpstashConfigured returns true when both URL and token are set", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "token"
    expect(isUpstashConfigured()).toBe(true)
  })

  it("throws RateLimitUnavailableError when Upstash isn't configured", async () => {
    await expect(checkWithUpstash("k", 10, 60_000)).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    )
  })
})
