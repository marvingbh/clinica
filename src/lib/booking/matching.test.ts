import { describe, it, expect } from "vitest"
import { classifyPhoneMatch } from "./matching"

describe("classifyPhoneMatch", () => {
  it("returns none for an empty list", () => {
    expect(classifyPhoneMatch([])).toEqual({ kind: "none" })
  })

  it("returns unique for a single id", () => {
    expect(classifyPhoneMatch(["p1"])).toEqual({ kind: "unique", patientId: "p1" })
  })

  it("de-duplicates the same id (Patient.phone ∪ PatientPhone.phone) into unique", () => {
    expect(classifyPhoneMatch(["p1", "p1", "p1"])).toEqual({ kind: "unique", patientId: "p1" })
  })

  it("returns ambiguous for two distinct ids", () => {
    const result = classifyPhoneMatch(["p1", "p2"])
    expect(result.kind).toBe("ambiguous")
    if (result.kind === "ambiguous") {
      expect(result.patientIds.sort()).toEqual(["p1", "p2"])
    }
  })

  it("de-duplicates before deciding ambiguity", () => {
    const result = classifyPhoneMatch(["p1", "p2", "p1", "p2"])
    expect(result.kind).toBe("ambiguous")
    if (result.kind === "ambiguous") {
      expect(result.patientIds).toHaveLength(2)
    }
  })
})
