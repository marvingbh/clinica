import { describe, it, expect } from "vitest"
import { slugifyProfessionalName, isValidBookingSlug } from "./slug"

describe("slugifyProfessionalName", () => {
  it("strips accents, lowercases and joins with hyphens", () => {
    expect(slugifyProfessionalName("Ana Müller")).toBe("ana-muller")
  })

  it("drops a leading honorific prefix", () => {
    expect(slugifyProfessionalName("Dra. Ana Müller")).toBe("ana-muller")
    expect(slugifyProfessionalName("Dr. Carlos")).toBe("carlos")
  })

  it("strips punctuation", () => {
    expect(slugifyProfessionalName("José da Silva, Jr.")).toBe("jose-da-silva-jr")
  })

  it("collapses runs of separators", () => {
    expect(slugifyProfessionalName("Ana   --  Maria")).toBe("ana-maria")
  })

  it("keeps a single-token name even if it matches a prefix", () => {
    // Don't strip the only token, otherwise the slug would be empty.
    expect(slugifyProfessionalName("Dra")).toBe("dra")
  })
})

describe("isValidBookingSlug", () => {
  it("accepts a simple slug", () => {
    expect(isValidBookingSlug("ana-muller")).toBe(true)
  })

  it("accepts digits", () => {
    expect(isValidBookingSlug("ana2")).toBe(true)
  })

  it("rejects double hyphens", () => {
    expect(isValidBookingSlug("ana--muller")).toBe(false)
  })

  it("rejects leading/trailing hyphens", () => {
    expect(isValidBookingSlug("-ana")).toBe(false)
    expect(isValidBookingSlug("ana-")).toBe(false)
  })

  it("rejects uppercase and spaces", () => {
    expect(isValidBookingSlug("Ana Muller")).toBe(false)
  })

  it("rejects a slug that is too short (< 2 chars)", () => {
    expect(isValidBookingSlug("a")).toBe(false)
  })

  it("rejects a slug that is too long (> 60 chars)", () => {
    expect(isValidBookingSlug("a".repeat(61))).toBe(false)
  })
})
