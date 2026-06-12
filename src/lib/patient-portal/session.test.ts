import { describe, it, expect } from "vitest"
import {
  generateSessionToken,
  hashSessionToken,
  portalCookieName,
  initialSessionExpiry,
  agendaSessionExpiry,
  isSessionValid,
  slideSession,
} from "./session"

describe("generateSessionToken", () => {
  it("produces a url-safe token of at least 32 bytes of entropy", () => {
    const token = generateSessionToken()
    // base64url of 32 bytes is 43 chars; ensure no +/= padding chars
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(43)
  })

  it("is unique across calls", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken())
  })
})

describe("hashSessionToken", () => {
  it("is stable", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"))
  })
  it("differs for different tokens", () => {
    expect(hashSessionToken("abc")).not.toBe(hashSessionToken("abd"))
  })
})

describe("portalCookieName", () => {
  it("namespaces by slug", () => {
    expect(portalCookieName("clinica-x")).toBe("portal_session_clinica-x")
  })
  it("strips unsafe characters", () => {
    expect(portalCookieName("a b/c;d")).toBe("portal_session_abcd")
  })
})

describe("initialSessionExpiry", () => {
  it("sets 30-day slide and 90-day ceiling", () => {
    const now = new Date("2026-06-11T00:00:00Z")
    const { expiresAt, absoluteExpiresAt } = initialSessionExpiry(now)
    expect(expiresAt.toISOString()).toBe("2026-07-11T00:00:00.000Z")
    expect(absoluteExpiresAt.toISOString()).toBe("2026-09-09T00:00:00.000Z")
  })
})

describe("agendaSessionExpiry", () => {
  it("expires 24h after now with no extra ceiling", () => {
    const now = new Date("2026-06-11T00:00:00Z")
    const { expiresAt, absoluteExpiresAt } = agendaSessionExpiry(now)
    expect(expiresAt.toISOString()).toBe("2026-06-12T00:00:00.000Z")
    expect(absoluteExpiresAt.getTime()).toBe(expiresAt.getTime())
  })
})

describe("isSessionValid", () => {
  const now = new Date("2026-06-11T12:00:00Z")
  const base = {
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + 1000),
    absoluteExpiresAt: new Date(now.getTime() + 10000),
    revokedAt: null,
  }

  it("is valid when fresh", () => {
    expect(isSessionValid(base, now)).toBe(true)
  })
  it("is invalid when revoked", () => {
    expect(isSessionValid({ ...base, revokedAt: now }, now)).toBe(false)
  })
  it("is invalid past expiresAt", () => {
    expect(isSessionValid({ ...base, expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false)
  })
  it("is invalid past absolute ceiling", () => {
    expect(
      isSessionValid({ ...base, absoluteExpiresAt: new Date(now.getTime() - 1) }, now),
    ).toBe(false)
  })
})

describe("slideSession", () => {
  const now = new Date("2026-06-11T12:00:00Z")

  it("does not touch when used within the last hour", () => {
    const r = slideSession(
      {
        lastUsedAt: new Date(now.getTime() - 30 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 1000),
        absoluteExpiresAt: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000),
      },
      now,
    )
    expect(r.shouldTouch).toBe(false)
  })

  it("slides 30 days forward when last touch was > 1h ago", () => {
    const r = slideSession(
      {
        lastUsedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 1000),
        absoluteExpiresAt: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000),
      },
      now,
    )
    expect(r.shouldTouch).toBe(true)
    expect(r.expiresAt.toISOString()).toBe("2026-07-11T12:00:00.000Z")
  })

  it("never slides past the absolute ceiling", () => {
    const ceiling = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 1 day away
    const r = slideSession(
      {
        lastUsedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 1000),
        absoluteExpiresAt: ceiling,
      },
      now,
    )
    expect(r.shouldTouch).toBe(true)
    expect(r.expiresAt.getTime()).toBe(ceiling.getTime())
  })
})
