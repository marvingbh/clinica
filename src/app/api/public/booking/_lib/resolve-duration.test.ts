import { describe, it, expect } from "vitest"
import { effectiveDuration, effectiveHorizon } from "./resolve-duration"

describe("effectiveDuration", () => {
  it("prefers the professional's own duration", () => {
    expect(effectiveDuration(40, 50)).toBe(40)
  })

  it("falls back to the clinic default when the professional has none", () => {
    expect(effectiveDuration(null, 50)).toBe(50)
    expect(effectiveDuration(undefined, 50)).toBe(50)
    expect(effectiveDuration(0, 50)).toBe(50)
  })
})

describe("effectiveHorizon", () => {
  it("caps the clinic horizon by the professional's max advance days", () => {
    expect(effectiveHorizon(30, 14)).toBe(14)
  })

  it("uses the clinic horizon when it is the smaller", () => {
    expect(effectiveHorizon(10, 30)).toBe(10)
  })

  it("ignores a missing professional cap", () => {
    expect(effectiveHorizon(30, null)).toBe(30)
    expect(effectiveHorizon(30, 0)).toBe(30)
  })
})
