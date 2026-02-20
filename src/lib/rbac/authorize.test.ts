import { describe, it, expect } from "vitest"
import { authorize, canPerform, getPermissionScope } from "./authorize"
import type { AuthUser } from "./types"

// Helper factory for test users
function makeAdmin(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    clinicId: "clinic-1",
    role: "ADMIN",
    professionalProfileId: "prof-1",
    permissions: {} as AuthUser["permissions"],
    ...overrides,
  }
}

function makeProfessional(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-2",
    clinicId: "clinic-1",
    role: "PROFESSIONAL",
    professionalProfileId: "prof-2",
    permissions: {} as AuthUser["permissions"],
    ...overrides,
  }
}

describe("authorize", () => {
  describe("role permission check", () => {
    it("denies action when role lacks permission", () => {
      const result = authorize({
        user: makeProfessional(),
        resource: "user",
        action: "create",
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("does not have permission")
    })

    it("allows action when role has permission", () => {
      const result = authorize({
        user: makeAdmin(),
        resource: "user",
        action: "create",
      })
      expect(result.allowed).toBe(true)
    })
  })

  describe("clinic scope", () => {
    it("allows access to resources in same clinic", () => {
      const result = authorize({
        user: makeAdmin(),
        resource: "appointment",
        action: "read",
        resourceClinicId: "clinic-1",
      })
      expect(result.allowed).toBe(true)
    })

    it("denies access to resources in different clinic", () => {
      const result = authorize({
        user: makeAdmin(),
        resource: "appointment",
        action: "read",
        resourceClinicId: "clinic-other",
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("different clinic")
    })

    it("allows when no resourceClinicId provided (list operations)", () => {
      const result = authorize({
        user: makeAdmin(),
        resource: "appointment",
        action: "list",
      })
      expect(result.allowed).toBe(true)
    })
  })

  describe("own scope", () => {
    it("allows professional to access own appointment", () => {
      const result = authorize({
        user: makeProfessional(),
        resource: "appointment",
        action: "read",
        resourceOwnerId: "prof-2",
      })
      expect(result.allowed).toBe(true)
    })

    it("denies professional access to other's appointment", () => {
      const result = authorize({
        user: makeProfessional(),
        resource: "appointment",
        action: "read",
        resourceOwnerId: "prof-other",
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("does not own")
    })

    it("allows when no resourceOwnerId (list operations filter later)", () => {
      const result = authorize({
        user: makeProfessional(),
        resource: "appointment",
        action: "list",
      })
      expect(result.allowed).toBe(true)
    })

    it("professional owns their own profile by professionalProfileId", () => {
      const result = authorize({
        user: makeProfessional(),
        resource: "professional-profile",
        action: "read",
        resourceOwnerId: "prof-2",
      })
      expect(result.allowed).toBe(true)
    })

    it("professional owns their own profile by userId too", () => {
      const result = authorize({
        user: makeProfessional(),
        resource: "professional-profile",
        action: "read",
        resourceOwnerId: "user-2",
      })
      expect(result.allowed).toBe(true)
    })

    it("clinic ownership check uses clinicId", () => {
      const admin = makeAdmin()
      const result = authorize({
        user: admin,
        resource: "clinic",
        action: "read",
        resourceOwnerId: "clinic-1",
      })
      expect(result.allowed).toBe(true)
    })

    it("patient ownership always returns true (verified elsewhere via DB)", () => {
      const result = authorize({
        user: makeProfessional(),
        resource: "patient",
        action: "read",
        resourceOwnerId: "any-patient-id",
      })
      expect(result.allowed).toBe(true)
    })
  })
})

describe("canPerform", () => {
  it("returns true when role has the permission", () => {
    expect(canPerform(makeAdmin(), "appointment", "create")).toBe(true)
    expect(canPerform(makeProfessional(), "appointment", "create")).toBe(true)
  })

  it("returns false when role lacks the permission", () => {
    expect(canPerform(makeProfessional(), "user", "create")).toBe(false)
    expect(canPerform(makeProfessional(), "clinic", "update")).toBe(false)
  })
})

describe("getPermissionScope", () => {
  it("returns clinic for admin appointment access", () => {
    expect(getPermissionScope(makeAdmin(), "appointment", "read")).toBe("clinic")
  })

  it("returns own for professional appointment access", () => {
    expect(getPermissionScope(makeProfessional(), "appointment", "read")).toBe("own")
  })

  it("returns null when no permission exists", () => {
    expect(getPermissionScope(makeProfessional(), "user", "create")).toBeNull()
  })
})
