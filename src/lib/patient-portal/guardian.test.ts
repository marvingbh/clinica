import { describe, it, expect } from "vitest"
import { isMinor, portalDisplayName } from "./guardian"

describe("isMinor", () => {
  const now = new Date("2026-06-11T12:00:00Z")

  it("returns false for a null birthDate", () => {
    expect(isMinor(null, now)).toBe(false)
  })

  it("returns true the day before the 18th birthday", () => {
    // turns 18 on 2026-06-12
    expect(isMinor(new Date("2008-06-12T00:00:00Z"), now)).toBe(true)
  })

  it("returns false on the exact 18th birthday", () => {
    // turns 18 on 2026-06-11
    expect(isMinor(new Date("2008-06-11T12:00:00Z"), now)).toBe(false)
  })

  it("returns false the day after the 18th birthday", () => {
    expect(isMinor(new Date("2008-06-10T00:00:00Z"), now)).toBe(false)
  })

  it("returns true for a young child", () => {
    expect(isMinor(new Date("2020-01-01T00:00:00Z"), now)).toBe(true)
  })
})

describe("portalDisplayName", () => {
  const now = new Date("2026-06-11T12:00:00Z")

  it("frames minors as guardian access", () => {
    expect(portalDisplayName({ name: "Ana", birthDate: new Date("2020-01-01") }, now)).toBe(
      "Responsável por Ana",
    )
  })

  it("returns the plain name for adults", () => {
    expect(portalDisplayName({ name: "Carlos", birthDate: new Date("1990-01-01") }, now)).toBe(
      "Carlos",
    )
  })

  it("returns the plain name when birthDate is unknown", () => {
    expect(portalDisplayName({ name: "Bruno", birthDate: null }, now)).toBe("Bruno")
  })
})
