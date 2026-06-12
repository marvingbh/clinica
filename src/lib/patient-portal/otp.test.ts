import { describe, it, expect } from "vitest"
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  isOtpUsable,
  otpExpiry,
  OTP_MAX_ATTEMPTS,
} from "./otp"

const SECRET = "test-secret"

describe("generateOtpCode", () => {
  it("generates a 6-digit string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode()
      expect(code).toMatch(/^\d{6}$/)
    }
  })
})

describe("hashOtpCode", () => {
  it("is deterministic for the same inputs", () => {
    const a = hashOtpCode(SECRET, "clinic1", "11999999999", "123456")
    const b = hashOtpCode(SECRET, "clinic1", "11999999999", "123456")
    expect(a).toBe(b)
  })

  it("differs across clinics (tenant isolation)", () => {
    const a = hashOtpCode(SECRET, "clinic1", "11999999999", "123456")
    const b = hashOtpCode(SECRET, "clinic2", "11999999999", "123456")
    expect(a).not.toBe(b)
  })

  it("differs across identifiers", () => {
    const a = hashOtpCode(SECRET, "clinic1", "a@x.com", "123456")
    const b = hashOtpCode(SECRET, "clinic1", "b@x.com", "123456")
    expect(a).not.toBe(b)
  })
})

describe("verifyOtpCode", () => {
  it("accepts the correct code", () => {
    const codeHash = hashOtpCode(SECRET, "clinic1", "id", "123456")
    expect(
      verifyOtpCode({ secret: SECRET, clinicId: "clinic1", identifier: "id", code: "123456", codeHash }),
    ).toBe(true)
  })

  it("rejects the wrong code", () => {
    const codeHash = hashOtpCode(SECRET, "clinic1", "id", "123456")
    expect(
      verifyOtpCode({ secret: SECRET, clinicId: "clinic1", identifier: "id", code: "000000", codeHash }),
    ).toBe(false)
  })

  it("rejects a code from another clinic", () => {
    const codeHash = hashOtpCode(SECRET, "clinic1", "id", "123456")
    expect(
      verifyOtpCode({ secret: SECRET, clinicId: "clinic2", identifier: "id", code: "123456", codeHash }),
    ).toBe(false)
  })

  it("returns false for a malformed (length-mismatched) hash", () => {
    expect(
      verifyOtpCode({ secret: SECRET, clinicId: "clinic1", identifier: "id", code: "123456", codeHash: "short" }),
    ).toBe(false)
  })
})

describe("isOtpUsable", () => {
  const now = new Date("2026-06-11T12:00:00Z")

  it("is usable when fresh", () => {
    expect(
      isOtpUsable({ expiresAt: new Date(now.getTime() + 60_000), consumedAt: null, attempts: 0 }, now),
    ).toEqual({ usable: true })
  })

  it("is expired past expiresAt", () => {
    expect(
      isOtpUsable({ expiresAt: new Date(now.getTime() - 1), consumedAt: null, attempts: 0 }, now),
    ).toEqual({ usable: false, reason: "expired" })
  })

  it("is consumed once consumedAt is set", () => {
    expect(
      isOtpUsable({ expiresAt: new Date(now.getTime() + 60_000), consumedAt: now, attempts: 0 }, now),
    ).toEqual({ usable: false, reason: "consumed" })
  })

  it("blocks after max attempts", () => {
    expect(
      isOtpUsable(
        { expiresAt: new Date(now.getTime() + 60_000), consumedAt: null, attempts: OTP_MAX_ATTEMPTS },
        now,
      ),
    ).toEqual({ usable: false, reason: "too_many_attempts" })
  })
})

describe("otpExpiry", () => {
  it("expires 10 minutes after now", () => {
    const now = new Date("2026-06-11T12:00:00Z")
    expect(otpExpiry(now).toISOString()).toBe("2026-06-11T12:10:00.000Z")
  })
})
