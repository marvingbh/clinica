import { describe, it, expect } from "vitest"
import { isValidTransition, getValidTransitions } from "./status-transitions"

describe("isValidTransition", () => {
  it("allows DRAFT → OPEN", () => {
    expect(isValidTransition("DRAFT", "OPEN")).toBe(true)
  })

  it("allows DRAFT → CANCELLED", () => {
    expect(isValidTransition("DRAFT", "CANCELLED")).toBe(true)
  })

  it("rejects DRAFT → PAID", () => {
    expect(isValidTransition("DRAFT", "PAID")).toBe(false)
  })

  it("allows OPEN → PAID", () => {
    expect(isValidTransition("OPEN", "PAID")).toBe(true)
  })

  it("allows OPEN → OVERDUE", () => {
    expect(isValidTransition("OPEN", "OVERDUE")).toBe(true)
  })

  it("allows OPEN → CANCELLED", () => {
    expect(isValidTransition("OPEN", "CANCELLED")).toBe(true)
  })

  it("allows OVERDUE → PAID", () => {
    expect(isValidTransition("OVERDUE", "PAID")).toBe(true)
  })

  it("allows OVERDUE → CANCELLED", () => {
    expect(isValidTransition("OVERDUE", "CANCELLED")).toBe(true)
  })

  it("rejects PAID → anything", () => {
    expect(isValidTransition("PAID", "OPEN")).toBe(false)
    expect(isValidTransition("PAID", "CANCELLED")).toBe(false)
    expect(isValidTransition("PAID", "OVERDUE")).toBe(false)
  })

  it("rejects CANCELLED → anything", () => {
    expect(isValidTransition("CANCELLED", "OPEN")).toBe(false)
    expect(isValidTransition("CANCELLED", "PAID")).toBe(false)
    expect(isValidTransition("CANCELLED", "DRAFT")).toBe(false)
  })
})

describe("getValidTransitions", () => {
  it("returns OPEN and CANCELLED for DRAFT", () => {
    expect(getValidTransitions("DRAFT")).toEqual(["OPEN", "CANCELLED"])
  })

  it("returns empty array for PAID", () => {
    expect(getValidTransitions("PAID")).toEqual([])
  })

  it("returns empty array for CANCELLED", () => {
    expect(getValidTransitions("CANCELLED")).toEqual([])
  })
})
