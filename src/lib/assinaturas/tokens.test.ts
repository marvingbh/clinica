import { describe, it, expect } from "vitest"
import {
  generateSigningToken,
  hashSigningToken,
  buildSigningUrl,
  computeExpiry,
  DEFAULT_EXPIRY_DAYS,
} from "./tokens"

describe("tokens", () => {
  it("generates a url-safe token of at least 32 bytes of entropy", () => {
    const token = generateSigningToken()
    // 32 bytes base64url ≈ 43 chars; no padding, no +/ characters
    expect(token.length).toBeGreaterThanOrEqual(43)
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true)
  })

  it("generates distinct tokens", () => {
    expect(generateSigningToken()).not.toBe(generateSigningToken())
  })

  it("hashes deterministically and the hash differs from the token", () => {
    const token = generateSigningToken()
    const h1 = hashSigningToken(token)
    const h2 = hashSigningToken(token)
    expect(h1).toBe(h2)
    expect(h1).not.toBe(token)
    expect(h1).toHaveLength(64) // sha256 hex
  })

  it("builds a /assinar/{token} url and trims trailing slashes", () => {
    expect(buildSigningUrl("https://app.test", "abc")).toBe("https://app.test/assinar/abc")
    expect(buildSigningUrl("https://app.test/", "abc")).toBe("https://app.test/assinar/abc")
  })

  it("computes default 30-day expiry and custom expiry", () => {
    const now = new Date("2026-06-11T00:00:00Z")
    const def = computeExpiry(now)
    expect(def.getTime() - now.getTime()).toBe(DEFAULT_EXPIRY_DAYS * 86_400_000)
    const custom = computeExpiry(now, 7)
    expect(custom.getTime() - now.getTime()).toBe(7 * 86_400_000)
  })

  it("clamps absurd expiry day values", () => {
    const now = new Date("2026-06-11T00:00:00Z")
    // 0 / undefined are falsy ⇒ fall back to the default
    expect(computeExpiry(now, 0).getTime() - now.getTime()).toBe(DEFAULT_EXPIRY_DAYS * 86_400_000)
    // a provided fraction below 1 clamps up to 1 day
    expect(computeExpiry(now, 0.2).getTime() - now.getTime()).toBe(1 * 86_400_000)
    expect(computeExpiry(now, 9999).getTime() - now.getTime()).toBe(365 * 86_400_000)
  })
})
