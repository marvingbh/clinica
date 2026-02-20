import { describe, it, expect } from "vitest"
import { hasPermission, resolvePermissions, meetsMinAccess, rolePermissions, ROLE_DEFAULTS } from "./permissions"

describe("hasPermission", () => {
  it("ADMIN has clinic-scoped appointment permissions", () => {
    const perm = hasPermission("ADMIN", "appointment", "read")
    expect(perm).not.toBeNull()
    expect(perm!.scope).toBe("clinic")
  })

  it("PROFESSIONAL has own-scoped appointment permissions", () => {
    const perm = hasPermission("PROFESSIONAL", "appointment", "read")
    expect(perm).not.toBeNull()
    expect(perm!.scope).toBe("own")
  })

  it("ADMIN has user management permissions", () => {
    expect(hasPermission("ADMIN", "user", "create")).not.toBeNull()
    expect(hasPermission("ADMIN", "user", "delete")).not.toBeNull()
  })

  it("PROFESSIONAL cannot manage users", () => {
    expect(hasPermission("PROFESSIONAL", "user", "create")).toBeNull()
    expect(hasPermission("PROFESSIONAL", "user", "read")).toBeNull()
    expect(hasPermission("PROFESSIONAL", "user", "list")).toBeNull()
  })

  it("PROFESSIONAL cannot manage clinic settings", () => {
    expect(hasPermission("PROFESSIONAL", "clinic", "read")).toBeNull()
    expect(hasPermission("PROFESSIONAL", "clinic", "update")).toBeNull()
  })

  it("ADMIN can read audit logs", () => {
    expect(hasPermission("ADMIN", "audit-log", "read")).not.toBeNull()
    expect(hasPermission("ADMIN", "audit-log", "list")).not.toBeNull()
  })

  it("PROFESSIONAL cannot access audit logs", () => {
    expect(hasPermission("PROFESSIONAL", "audit-log", "read")).toBeNull()
    expect(hasPermission("PROFESSIONAL", "audit-log", "list")).toBeNull()
  })

  it("returns null for non-existent resource/action combinations", () => {
    expect(hasPermission("ADMIN", "clinic", "delete")).toBeNull()
  })
})

describe("resolvePermissions", () => {
  it("returns role defaults when no overrides", () => {
    const resolved = resolvePermissions("ADMIN", {})
    expect(resolved.agenda_own).toBe("WRITE")
    expect(resolved.audit_logs).toBe("READ")
    expect(resolved.patients).toBe("WRITE")
  })

  it("returns role defaults for PROFESSIONAL", () => {
    const resolved = resolvePermissions("PROFESSIONAL", {})
    expect(resolved.agenda_own).toBe("WRITE")
    expect(resolved.agenda_others).toBe("NONE")
    expect(resolved.users).toBe("NONE")
    expect(resolved.audit_logs).toBe("NONE")
  })

  it("applies overrides on top of defaults", () => {
    const resolved = resolvePermissions("PROFESSIONAL", {
      audit_logs: "READ",
      patients: "WRITE",
    })
    expect(resolved.audit_logs).toBe("READ")
    expect(resolved.patients).toBe("WRITE")
    expect(resolved.agenda_own).toBe("WRITE")
    expect(resolved.users).toBe("NONE")
  })

  it("override can restrict ADMIN permissions", () => {
    const resolved = resolvePermissions("ADMIN", {
      patients: "NONE",
    })
    expect(resolved.patients).toBe("NONE")
  })
})

describe("meetsMinAccess", () => {
  it("WRITE meets WRITE", () => {
    expect(meetsMinAccess("WRITE", "WRITE")).toBe(true)
  })

  it("WRITE meets READ", () => {
    expect(meetsMinAccess("WRITE", "READ")).toBe(true)
  })

  it("READ meets READ", () => {
    expect(meetsMinAccess("READ", "READ")).toBe(true)
  })

  it("READ does not meet WRITE", () => {
    expect(meetsMinAccess("READ", "WRITE")).toBe(false)
  })

  it("NONE meets NONE", () => {
    expect(meetsMinAccess("NONE", "NONE")).toBe(true)
  })

  it("NONE does not meet READ", () => {
    expect(meetsMinAccess("NONE", "READ")).toBe(false)
  })
})
