import { describe, it, expect } from "vitest"
import { isPhoneBlocked, exceedsOpenBookingLimit, isHoneypotTripped } from "./anti-abuse"

describe("isPhoneBlocked", () => {
  it("returns true when the normalized phone is on the blocklist", () => {
    expect(isPhoneBlocked(["11999999999", "11888888888"], "11999999999")).toBe(true)
  })

  it("returns false when the phone is not on the blocklist", () => {
    expect(isPhoneBlocked(["11999999999"], "11777777777")).toBe(false)
  })

  it("returns false for an empty blocklist", () => {
    expect(isPhoneBlocked([], "11999999999")).toBe(false)
  })
})

describe("exceedsOpenBookingLimit", () => {
  it("is false below the limit", () => {
    expect(exceedsOpenBookingLimit(1, 2)).toBe(false)
  })

  it("is true at the limit", () => {
    expect(exceedsOpenBookingLimit(2, 2)).toBe(true)
  })

  it("is true above the limit", () => {
    expect(exceedsOpenBookingLimit(3, 2)).toBe(true)
  })
})

describe("isHoneypotTripped", () => {
  it("is false when website is undefined", () => {
    expect(isHoneypotTripped({})).toBe(false)
  })

  it("is false when website is empty", () => {
    expect(isHoneypotTripped({ website: "" })).toBe(false)
  })

  it("is false when website is only whitespace", () => {
    expect(isHoneypotTripped({ website: "   " })).toBe(false)
  })

  it("is true when website is filled", () => {
    expect(isHoneypotTripped({ website: "http://spam.example" })).toBe(true)
  })
})
