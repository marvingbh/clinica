import { describe, it, expect } from "vitest"
import { calculateApplicationFeeCents, toCents, fromCents } from "./fees"

describe("calculateApplicationFeeCents", () => {
  it("floors the fee", () => {
    // 10000 * 2.5 / 100 = 250
    expect(calculateApplicationFeeCents(10000, 2.5)).toBe(250)
    // 333 * 3 / 100 = 9.99 -> floor 9
    expect(calculateApplicationFeeCents(333, 3)).toBe(9)
  })

  it("returns 0 for 0% (trial / fee-less plan)", () => {
    expect(calculateApplicationFeeCents(10000, 0)).toBe(0)
  })

  it("returns 0 for negative percent", () => {
    expect(calculateApplicationFeeCents(10000, -5)).toBe(0)
  })

  it("equals the full amount at 100%", () => {
    expect(calculateApplicationFeeCents(5000, 100)).toBe(5000)
  })

  it("never exceeds the amount", () => {
    expect(calculateApplicationFeeCents(5000, 150)).toBe(5000)
  })

  it("returns 0 for zero amount", () => {
    expect(calculateApplicationFeeCents(0, 10)).toBe(0)
  })
})

describe("toCents / fromCents", () => {
  it("converts R$ decimals to cents (round)", () => {
    expect(toCents(123.45)).toBe(12345)
    expect(toCents(0.1)).toBe(10)
    expect(toCents(99.999)).toBe(10000)
  })

  it("converts cents to R$ decimals (2 places)", () => {
    expect(fromCents(12345)).toBe(123.45)
    expect(fromCents(10)).toBe(0.1)
  })

  it("round-trips with 2 decimal places", () => {
    for (const v of [0, 1, 0.05, 99.9, 1234.56, 0.01]) {
      expect(fromCents(toCents(v))).toBe(v)
    }
  })
})
