import { describe, it, expect, vi, afterEach } from "vitest"
import {
  generateScaleToken,
  hashScaleToken,
  buildScaleUrl,
  computeExpiry,
  SCALE_TOKEN_TTL_DAYS,
} from "./tokens"

afterEach(() => {
  vi.useRealTimers()
})

describe("generateScaleToken", () => {
  it("produces a url-safe token of at least 43 chars", () => {
    const { token } = generateScaleToken()
    expect(token.length).toBeGreaterThanOrEqual(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("hashScaleToken(token) equals the returned tokenHash (64 hex chars)", () => {
    const { token, tokenHash } = generateScaleToken()
    expect(hashScaleToken(token)).toBe(tokenHash)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("two tokens are never equal", () => {
    const a = generateScaleToken()
    const b = generateScaleToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
})

describe("buildScaleUrl", () => {
  it("builds /escala/{token}", () => {
    expect(buildScaleUrl("https://app.exemplo.com", "abc")).toBe(
      "https://app.exemplo.com/escala/abc"
    )
  })

  it("trims a trailing slash on the base url", () => {
    expect(buildScaleUrl("https://app.exemplo.com/", "abc")).toBe(
      "https://app.exemplo.com/escala/abc"
    )
  })
})

describe("computeExpiry", () => {
  it("defaults to now + 7 days", () => {
    vi.useFakeTimers()
    const now = new Date("2026-06-12T00:00:00Z")
    vi.setSystemTime(now)
    const exp = computeExpiry(now)
    const days = (exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBe(SCALE_TOKEN_TTL_DAYS)
    expect(days).toBe(7)
  })

  it("honors a custom TTL", () => {
    const now = new Date("2026-06-12T00:00:00Z")
    const exp = computeExpiry(now, 3)
    const days = (exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBe(3)
  })

  it("falls back to the default for a non-positive TTL", () => {
    const now = new Date("2026-06-12T00:00:00Z")
    const days = (computeExpiry(now, 0).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBe(SCALE_TOKEN_TTL_DAYS)
  })
})
