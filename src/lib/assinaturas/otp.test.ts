import { describe, it, expect } from "vitest"
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  isOtpUsable,
  maskContact,
  OTP_MAX_ATTEMPTS,
} from "./otp"

describe("otp", () => {
  it("always generates 6 digits including leading zeros", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode()
      expect(code).toMatch(/^\d{6}$/)
    }
  })

  it("hashes deterministically and binds the requestId", () => {
    const secret = "test-secret"
    const a = hashOtpCode(secret, "req1", "123456")
    const b = hashOtpCode(secret, "req1", "123456")
    const c = hashOtpCode(secret, "req2", "123456")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(64)
  })

  it("verifies a correct code (timing-safe) and rejects wrong/length-mismatched", () => {
    const secret = "s"
    const hash = hashOtpCode(secret, "req1", "000123")
    expect(verifyOtpCode({ secret, requestId: "req1", code: "000123", codeHash: hash })).toBe(true)
    expect(verifyOtpCode({ secret, requestId: "req1", code: "999999", codeHash: hash })).toBe(false)
    expect(verifyOtpCode({ secret, requestId: "req2", code: "000123", codeHash: hash })).toBe(false)
    expect(verifyOtpCode({ secret, requestId: "req1", code: "000123", codeHash: "short" })).toBe(false)
  })

  it("isOtpUsable detects expired / consumed / too many attempts", () => {
    const now = new Date("2026-06-11T12:00:00Z")
    const future = new Date("2026-06-11T12:05:00Z")
    const past = new Date("2026-06-11T11:50:00Z")
    expect(isOtpUsable({ expiresAt: future, consumedAt: null, attempts: 0 }, now)).toEqual({ usable: true })
    expect(isOtpUsable({ expiresAt: past, consumedAt: null, attempts: 0 }, now)).toEqual({ usable: false, reason: "expired" })
    expect(isOtpUsable({ expiresAt: future, consumedAt: now, attempts: 0 }, now)).toEqual({ usable: false, reason: "consumed" })
    expect(isOtpUsable({ expiresAt: future, consumedAt: null, attempts: OTP_MAX_ATTEMPTS }, now)).toEqual({ usable: false, reason: "too_many_attempts" })
  })

  it("masks emails and phones", () => {
    expect(maskContact("maria@gmail.com")).toBe("m***a@g***l.com")
    expect(maskContact("(11) 98765-4321")).toBe("(**) *****-4321")
  })
})
