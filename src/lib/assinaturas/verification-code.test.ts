import { describe, it, expect } from "vitest"
import {
  generateVerificationCode,
  normalizeVerificationCode,
  isValidVerificationCodeFormat,
  formatVerificationCode,
} from "./verification-code"

const AMBIGUOUS = ["0", "O", "1", "I", "L"]

describe("verification-code", () => {
  it("generates the XXXX-XXXX-XXXX format with no ambiguous characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateVerificationCode()
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
      for (const ch of AMBIGUOUS) {
        expect(code.includes(ch)).toBe(false)
      }
    }
  })

  it("normalizes lowercase and stripped hyphens and round-trips with format", () => {
    const code = generateVerificationCode()
    const normalized = normalizeVerificationCode(code.toLowerCase())
    expect(normalized).toBe(code.replace(/-/g, ""))
    expect(formatVerificationCode(normalized)).toBe(code)
  })

  it("rejects malformed input", () => {
    expect(isValidVerificationCodeFormat("ABC")).toBe(false)
    expect(isValidVerificationCodeFormat("0OIL-0OIL-0OIL")).toBe(false) // ambiguous chars
    expect(isValidVerificationCodeFormat("K7XF-2MQ9-PA4D")).toBe(true)
    expect(isValidVerificationCodeFormat("k7xf2mq9pa4d")).toBe(true)
  })
})
