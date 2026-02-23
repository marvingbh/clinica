import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { signLink, verifyLink, buildConfirmUrl, buildCancelUrl } from "./appointment-links"

const TEST_SECRET = "test-secret-key-for-hmac"
const APPOINTMENT_ID = "clxyz123abc"
const BASE_URL = "https://clinica.example.com"

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("signLink", () => {
  it("produces an object with expires and sig", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const result = signLink(APPOINTMENT_ID, "confirm", scheduledAt)

    expect(result).toHaveProperty("expires")
    expect(result).toHaveProperty("sig")
    expect(typeof result.expires).toBe("number")
    expect(typeof result.sig).toBe("string")
    expect(result.sig).toMatch(/^[a-f0-9]{64}$/) // HMAC-SHA256 hex
  })

  it("defaults expiry to scheduledAt + 24 hours", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const result = signLink(APPOINTMENT_ID, "confirm", scheduledAt)

    const expectedExpires = Math.floor(scheduledAt.getTime() / 1000) + 24 * 60 * 60
    expect(result.expires).toBe(expectedExpires)
  })

  it("throws if AUTH_SECRET is not set", () => {
    vi.stubEnv("AUTH_SECRET", "")

    expect(() =>
      signLink(APPOINTMENT_ID, "confirm", new Date())
    ).toThrow("AUTH_SECRET")
  })

  it("produces different signatures for different actions", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const confirm = signLink(APPOINTMENT_ID, "confirm", scheduledAt)
    const cancel = signLink(APPOINTMENT_ID, "cancel", scheduledAt)

    expect(confirm.sig).not.toBe(cancel.sig)
  })

  it("produces different signatures for different appointment IDs", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const sig1 = signLink("apt-1", "confirm", scheduledAt)
    const sig2 = signLink("apt-2", "confirm", scheduledAt)

    expect(sig1.sig).not.toBe(sig2.sig)
  })
})

describe("verifyLink", () => {
  it("returns valid for a correctly signed link", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const { expires, sig } = signLink(APPOINTMENT_ID, "confirm", scheduledAt)

    const result = verifyLink(APPOINTMENT_ID, "confirm", expires, sig)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("returns invalid for expired link", () => {
    // Schedule in the past so expires is also in the past
    const pastDate = new Date("2020-01-01T00:00:00Z")
    const { expires, sig } = signLink(APPOINTMENT_ID, "confirm", pastDate)

    const result = verifyLink(APPOINTMENT_ID, "confirm", expires, sig)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("expirou")
  })

  it("returns invalid for tampered appointmentId", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const { expires, sig } = signLink(APPOINTMENT_ID, "confirm", scheduledAt)

    const result = verifyLink("tampered-id", "confirm", expires, sig)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("invalido")
  })

  it("returns invalid for tampered action", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const { expires, sig } = signLink(APPOINTMENT_ID, "confirm", scheduledAt)

    // Signed as "confirm" but verifying as "cancel"
    const result = verifyLink(APPOINTMENT_ID, "cancel", expires, sig)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("invalido")
  })

  it("returns invalid for tampered expires", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const { expires, sig } = signLink(APPOINTMENT_ID, "confirm", scheduledAt)

    const result = verifyLink(APPOINTMENT_ID, "confirm", expires + 3600, sig)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("invalido")
  })

  it("returns invalid for tampered signature", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const { expires } = signLink(APPOINTMENT_ID, "confirm", scheduledAt)

    const result = verifyLink(APPOINTMENT_ID, "confirm", expires, "deadbeef".repeat(8))
    expect(result.valid).toBe(false)
    expect(result.error).toContain("invalido")
  })

  it("throws if AUTH_SECRET is not set", () => {
    vi.stubEnv("AUTH_SECRET", "")

    expect(() =>
      verifyLink(APPOINTMENT_ID, "confirm", 9999999999, "abc")
    ).toThrow("AUTH_SECRET")
  })
})

describe("buildConfirmUrl", () => {
  it("builds a full URL with /confirm path", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const url = buildConfirmUrl(BASE_URL, APPOINTMENT_ID, scheduledAt)

    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/confirm")
    expect(parsed.searchParams.get("id")).toBe(APPOINTMENT_ID)
    expect(parsed.searchParams.has("expires")).toBe(true)
    expect(parsed.searchParams.has("sig")).toBe(true)
  })

  it("produces a URL that verifies correctly", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const url = buildConfirmUrl(BASE_URL, APPOINTMENT_ID, scheduledAt)

    const parsed = new URL(url)
    const id = parsed.searchParams.get("id")!
    const expires = Number(parsed.searchParams.get("expires"))
    const sig = parsed.searchParams.get("sig")!

    const result = verifyLink(id, "confirm", expires, sig)
    expect(result.valid).toBe(true)
  })
})

describe("buildCancelUrl", () => {
  it("builds a full URL with /cancel path", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const url = buildCancelUrl(BASE_URL, APPOINTMENT_ID, scheduledAt)

    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/cancel")
    expect(parsed.searchParams.get("id")).toBe(APPOINTMENT_ID)
    expect(parsed.searchParams.has("expires")).toBe(true)
    expect(parsed.searchParams.has("sig")).toBe(true)
  })

  it("produces a URL that verifies correctly", () => {
    const scheduledAt = new Date("2026-03-10T14:00:00Z")
    const url = buildCancelUrl(BASE_URL, APPOINTMENT_ID, scheduledAt)

    const parsed = new URL(url)
    const id = parsed.searchParams.get("id")!
    const expires = Number(parsed.searchParams.get("expires"))
    const sig = parsed.searchParams.get("sig")!

    const result = verifyLink(id, "cancel", expires, sig)
    expect(result.valid).toBe(true)
  })
})
