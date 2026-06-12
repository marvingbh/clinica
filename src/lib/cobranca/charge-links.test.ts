import { describe, it, expect, beforeEach } from "vitest"
import { signChargeLink, verifyChargeLink, buildPaymentLinkUrl } from "./charge-links"

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-charge-links"
})

describe("signChargeLink / verifyChargeLink", () => {
  it("verifies a freshly signed link", () => {
    const sig = signChargeLink("charge_123")
    expect(verifyChargeLink("charge_123", sig)).toBe(true)
  })

  it("rejects a tampered signature", () => {
    const sig = signChargeLink("charge_123")
    const tampered = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a")
    expect(verifyChargeLink("charge_123", tampered)).toBe(false)
  })

  it("rejects a signature for a different chargeId", () => {
    const sig = signChargeLink("charge_123")
    expect(verifyChargeLink("charge_456", sig)).toBe(false)
  })

  it("rejects a signature of wrong length (timing-safe guard)", () => {
    expect(verifyChargeLink("charge_123", "short")).toBe(false)
    expect(verifyChargeLink("charge_123", "")).toBe(false)
  })

  it("is deterministic for the same chargeId", () => {
    expect(signChargeLink("abc")).toBe(signChargeLink("abc"))
  })
})

describe("buildPaymentLinkUrl", () => {
  it("builds the public link with a valid signature", () => {
    const url = buildPaymentLinkUrl("https://app.example.com", "charge_789")
    expect(url).toMatch(
      /^https:\/\/app\.example\.com\/api\/public\/pagar\/charge_789\?s=[a-f0-9]{64}$/
    )
    const sig = new URL(url).searchParams.get("s")!
    expect(verifyChargeLink("charge_789", sig)).toBe(true)
  })
})
