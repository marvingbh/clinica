import { describe, it, expect } from "vitest"
import { normalizeIdentifier } from "./identifier"

describe("normalizeIdentifier", () => {
  it("normalizes a masked Brazilian phone to digits", () => {
    expect(normalizeIdentifier("(11) 99999-9999")).toEqual({
      kind: "phone",
      value: "11999999999",
    })
  })

  it("keeps the leading + for international numbers", () => {
    expect(normalizeIdentifier("+351 912 345 678")).toEqual({
      kind: "phone",
      value: "+351912345678",
    })
  })

  it("lowercases e-mail addresses", () => {
    expect(normalizeIdentifier("Joao.Silva@Example.COM")).toEqual({
      kind: "email",
      value: "joao.silva@example.com",
    })
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeIdentifier("  joao@example.com  ")).toEqual({
      kind: "email",
      value: "joao@example.com",
    })
  })

  it("returns null for an invalid e-mail", () => {
    expect(normalizeIdentifier("not-an-email@")).toBeNull()
    expect(normalizeIdentifier("@nope.com")).toBeNull()
  })

  it("returns null for an invalid phone", () => {
    expect(normalizeIdentifier("123")).toBeNull()
    expect(normalizeIdentifier("abc")).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(normalizeIdentifier("")).toBeNull()
    expect(normalizeIdentifier("   ")).toBeNull()
  })
})
