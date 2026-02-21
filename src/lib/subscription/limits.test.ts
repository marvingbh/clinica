import { describe, it, expect } from "vitest"
import { checkProfessionalLimit } from "./limits"

describe("checkProfessionalLimit", () => {
  it("allows when under limit", () => {
    const result = checkProfessionalLimit({ maxProfessionals: 5, currentCount: 3 })
    expect(result.allowed).toBe(true)
    expect(result.message).toBeUndefined()
  })
  it("blocks when at limit", () => {
    const result = checkProfessionalLimit({ maxProfessionals: 2, currentCount: 2 })
    expect(result.allowed).toBe(false)
    expect(result.message).toContain("2")
  })
  it("blocks when over limit", () => {
    const result = checkProfessionalLimit({ maxProfessionals: 2, currentCount: 5 })
    expect(result.allowed).toBe(false)
  })
  it("allows unlimited when maxProfessionals is -1", () => {
    const result = checkProfessionalLimit({ maxProfessionals: -1, currentCount: 100 })
    expect(result.allowed).toBe(true)
  })
  it("allows when no plan (null maxProfessionals)", () => {
    const result = checkProfessionalLimit({ maxProfessionals: null, currentCount: 100 })
    expect(result.allowed).toBe(true)
  })
})
