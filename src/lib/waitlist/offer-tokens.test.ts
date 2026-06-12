import { describe, it, expect } from "vitest"
import { generateOfferToken, hashOfferToken, buildOfferUrl } from "./offer-tokens"

describe("offer-tokens", () => {
  it("generates a 64-char hex token", () => {
    const token = generateOfferToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it("generates a unique token across calls", () => {
    const a = generateOfferToken()
    const b = generateOfferToken()
    expect(a).not.toBe(b)
  })

  it("hashes deterministically", () => {
    expect(hashOfferToken("abc")).toBe(hashOfferToken("abc"))
    expect(hashOfferToken("abc")).not.toBe(hashOfferToken("abd"))
  })

  it("produces a 64-char sha256 hex hash", () => {
    expect(hashOfferToken("anything")).toMatch(/^[0-9a-f]{64}$/)
  })

  it("builds the public offer URL", () => {
    expect(buildOfferUrl("https://app.exemplo.com", "tok123")).toBe(
      "https://app.exemplo.com/oferta?token=tok123"
    )
  })
})
