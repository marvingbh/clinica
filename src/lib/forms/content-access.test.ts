import { describe, it, expect } from "vitest"
import { canAccessResponseContent } from "./content-access"

const base = {
  userProfessionalProfileId: "prof-1",
  patientReferenceProfessionalId: "prof-2",
  responseProfessionalProfileId: "prof-3",
  responseSentByUserId: "user-9",
  userId: "user-1",
}

describe("canAccessResponseContent", () => {
  it("ADMIN always may read content", () => {
    expect(canAccessResponseContent({ ...base, role: "ADMIN" })).toBe(true)
  })

  it("reference professional may read", () => {
    expect(
      canAccessResponseContent({ ...base, role: "PROFESSIONAL", userProfessionalProfileId: "prof-2" })
    ).toBe(true)
  })

  it("the send's professional may read", () => {
    expect(
      canAccessResponseContent({ ...base, role: "PROFESSIONAL", userProfessionalProfileId: "prof-3" })
    ).toBe(true)
  })

  it("the user who sent it may read even without a matching profile", () => {
    expect(
      canAccessResponseContent({
        ...base,
        role: "PROFESSIONAL",
        userProfessionalProfileId: null,
        userId: "user-9",
      })
    ).toBe(true)
  })

  it("an unrelated professional may not read", () => {
    expect(canAccessResponseContent({ ...base, role: "PROFESSIONAL" })).toBe(false)
  })
})
