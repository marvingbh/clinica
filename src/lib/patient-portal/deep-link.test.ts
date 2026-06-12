import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { signPortalLink, verifyPortalLink, buildPortalDeepLink } from "./deep-link"

const ORIGINAL_SECRET = process.env.AUTH_SECRET

beforeEach(() => {
  process.env.AUTH_SECRET = "test-portal-secret"
})

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET
  vi.useRealTimers()
})

function futureExpires(): number {
  return Math.floor(Date.now() / 1000) + 3600
}

describe("signPortalLink / verifyPortalLink", () => {
  it("round-trips a valid token", () => {
    const expires = futureExpires()
    const token = signPortalLink("patient1", "clinica-x", expires)
    const result = verifyPortalLink(token)
    expect(result.valid).toBe(true)
    expect(result.patientId).toBe("patient1")
    expect(result.clinicSlug).toBe("clinica-x")
  })

  it("rejects a tampered signature", () => {
    const token = signPortalLink("patient1", "clinica-x", futureExpires())
    const tampered = token.slice(0, -2) + "00"
    expect(verifyPortalLink(tampered).valid).toBe(false)
  })

  it("rejects a swapped slug", () => {
    const expires = futureExpires()
    const token = signPortalLink("patient1", "clinica-x", expires)
    const parts = token.split(".")
    const swapped = `${parts[0]}.clinica-y.${parts[2]}.${parts[3]}`
    expect(verifyPortalLink(swapped).valid).toBe(false)
  })

  it("rejects a swapped patientId", () => {
    const expires = futureExpires()
    const token = signPortalLink("patient1", "clinica-x", expires)
    const parts = token.split(".")
    const swapped = `patient2.${parts[1]}.${parts[2]}.${parts[3]}`
    expect(verifyPortalLink(swapped).valid).toBe(false)
  })

  it("rejects an expired token", () => {
    const expires = Math.floor(Date.now() / 1000) - 10
    const token = signPortalLink("patient1", "clinica-x", expires)
    const result = verifyPortalLink(token)
    expect(result.valid).toBe(false)
    expect(result.error).toBe("Link expirado")
  })

  it("rejects a malformed token", () => {
    expect(verifyPortalLink("garbage").valid).toBe(false)
    expect(verifyPortalLink("a.b.c").valid).toBe(false)
  })
})

describe("buildPortalDeepLink", () => {
  it("embeds a token that expires 24h after the session", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-11T00:00:00Z"))
    const scheduledAt = new Date("2026-06-12T15:00:00Z")
    const url = buildPortalDeepLink("https://app.example.com", "clinica-x", "patient1", scheduledAt)
    expect(url).toContain("https://app.example.com/paciente/clinica-x/entrar?token=")

    const token = decodeURIComponent(url.split("token=")[1])
    const expires = Number(token.split(".")[2])
    const expected = Math.floor(scheduledAt.getTime() / 1000) + 24 * 60 * 60
    expect(expires).toBe(expected)
    // and it verifies as valid while we're still before expiry
    expect(verifyPortalLink(token).valid).toBe(true)
  })
})
