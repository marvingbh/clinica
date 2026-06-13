import { describe, it, expect } from "vitest"
import { generateFormToken, hashFormToken, buildFormUrl, computeFormExpiry, DEFAULT_EXPIRY_DAYS } from "./tokens"

describe("generateFormToken", () => {
  it("produces a url-safe token of at least 43 chars", () => {
    const { token } = generateFormToken()
    expect(token.length).toBeGreaterThanOrEqual(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("hashFormToken(token) equals the returned tokenHash", () => {
    const { token, tokenHash } = generateFormToken()
    expect(hashFormToken(token)).toBe(tokenHash)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("two tokens are never equal", () => {
    const a = generateFormToken()
    const b = generateFormToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
})

describe("buildFormUrl", () => {
  it("builds /f/{token}", () => {
    expect(buildFormUrl("https://app.exemplo.com", "abc")).toBe("https://app.exemplo.com/f/abc")
  })

  it("trims a trailing slash on the base url", () => {
    expect(buildFormUrl("https://app.exemplo.com/", "abc")).toBe("https://app.exemplo.com/f/abc")
  })
})

describe("computeFormExpiry", () => {
  const now = new Date("2026-06-12T00:00:00Z")

  it("defaults to DEFAULT_EXPIRY_DAYS", () => {
    const exp = computeFormExpiry(now)
    const days = (exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBe(DEFAULT_EXPIRY_DAYS)
  })

  it("clamps to a sane range", () => {
    const tooMany = computeFormExpiry(now, 9999)
    const daysMax = (tooMany.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(daysMax).toBe(365)
    const tooFew = computeFormExpiry(now, -5)
    const daysMin = (tooFew.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(daysMin).toBe(1)
  })

  it("falls back to the default for a zero/undefined day count", () => {
    const exp = computeFormExpiry(now, 0)
    const days = (exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBe(DEFAULT_EXPIRY_DAYS)
  })
})
