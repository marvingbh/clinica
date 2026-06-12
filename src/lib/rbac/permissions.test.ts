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

describe("prontuario feature (CFP secrecy inversion)", () => {
  it("ADMIN default is NONE (cannot read clinical content)", () => {
    expect(ROLE_DEFAULTS.ADMIN.prontuario).toBe("NONE")
  })

  it("PROFESSIONAL default is WRITE", () => {
    expect(ROLE_DEFAULTS.PROFESSIONAL.prontuario).toBe("WRITE")
  })

  it("override grants READ to a clinical director (ADMIN)", () => {
    const resolved = resolvePermissions("ADMIN", { prontuario: "READ" })
    expect(resolved.prontuario).toBe("READ")
  })

  it("resolves to NONE for sessions missing the feature override", () => {
    const resolved = resolvePermissions("ADMIN", {})
    expect(resolved.prontuario).toBe("NONE")
  })
})

describe("ai_assist feature", () => {
  it("ADMIN default is WRITE", () => {
    expect(ROLE_DEFAULTS.ADMIN.ai_assist).toBe("WRITE")
  })

  it("PROFESSIONAL default is WRITE", () => {
    expect(ROLE_DEFAULTS.PROFESSIONAL.ai_assist).toBe("WRITE")
  })

  it("resolves to WRITE for PROFESSIONAL with no overrides", () => {
    const resolved = resolvePermissions("PROFESSIONAL", {})
    expect(resolved.ai_assist).toBe("WRITE")
  })

  it("admin override to NONE disables AI for a specific user", () => {
    const resolved = resolvePermissions("PROFESSIONAL", { ai_assist: "NONE" })
    expect(resolved.ai_assist).toBe("NONE")
  })
})

describe("online_booking feature", () => {
  it("ADMIN default is WRITE", () => {
    expect(ROLE_DEFAULTS.ADMIN.online_booking).toBe("WRITE")
  })

  it("PROFESSIONAL default is WRITE", () => {
    expect(ROLE_DEFAULTS.PROFESSIONAL.online_booking).toBe("WRITE")
  })

  it("resolves to WRITE for ADMIN with no overrides", () => {
    const resolved = resolvePermissions("ADMIN", {})
    expect(resolved.online_booking).toBe("WRITE")
  })

  it("admin override to NONE removes booking access for a specific user", () => {
    const resolved = resolvePermissions("PROFESSIONAL", { online_booking: "NONE" })
    expect(resolved.online_booking).toBe("NONE")
  })
})

describe("waitlist feature", () => {
  it("ADMIN default is WRITE", () => {
    expect(ROLE_DEFAULTS.ADMIN.waitlist).toBe("WRITE")
  })

  it("PROFESSIONAL default is WRITE", () => {
    expect(ROLE_DEFAULTS.PROFESSIONAL.waitlist).toBe("WRITE")
  })

  it("resolves to WRITE for both roles with no overrides", () => {
    expect(resolvePermissions("ADMIN", {}).waitlist).toBe("WRITE")
    expect(resolvePermissions("PROFESSIONAL", {}).waitlist).toBe("WRITE")
  })

  it("honors an override to NONE", () => {
    const resolved = resolvePermissions("PROFESSIONAL", { waitlist: "NONE" })
    expect(resolved.waitlist).toBe("NONE")
  })
})

describe("calendar_sync feature", () => {
  it("ADMIN default is WRITE", () => {
    expect(ROLE_DEFAULTS.ADMIN.calendar_sync).toBe("WRITE")
  })

  it("PROFESSIONAL default is WRITE", () => {
    expect(ROLE_DEFAULTS.PROFESSIONAL.calendar_sync).toBe("WRITE")
  })

  it("resolves to WRITE for both roles with no overrides", () => {
    expect(resolvePermissions("ADMIN", {}).calendar_sync).toBe("WRITE")
    expect(resolvePermissions("PROFESSIONAL", {}).calendar_sync).toBe("WRITE")
  })

  it("honors an override to NONE", () => {
    const resolved = resolvePermissions("PROFESSIONAL", { calendar_sync: "NONE" })
    expect(resolved.calendar_sync).toBe("NONE")
  })
})

describe("fiscal feature", () => {
  it("ADMIN default is WRITE", () => {
    expect(ROLE_DEFAULTS.ADMIN.fiscal).toBe("WRITE")
  })

  it("PROFESSIONAL default is WRITE", () => {
    expect(ROLE_DEFAULTS.PROFESSIONAL.fiscal).toBe("WRITE")
  })

  it("resolves to WRITE for both roles with no overrides", () => {
    expect(resolvePermissions("ADMIN", {}).fiscal).toBe("WRITE")
    expect(resolvePermissions("PROFESSIONAL", {}).fiscal).toBe("WRITE")
  })

  it("honors an override to NONE", () => {
    const resolved = resolvePermissions("PROFESSIONAL", { fiscal: "NONE" })
    expect(resolved.fiscal).toBe("NONE")
  })
})

describe("documents feature", () => {
  it("ADMIN default is WRITE", () => {
    expect(ROLE_DEFAULTS.ADMIN.documents).toBe("WRITE")
  })

  it("PROFESSIONAL default is WRITE", () => {
    expect(ROLE_DEFAULTS.PROFESSIONAL.documents).toBe("WRITE")
  })

  it("resolves to WRITE for both roles with no overrides", () => {
    expect(resolvePermissions("ADMIN", {}).documents).toBe("WRITE")
    expect(resolvePermissions("PROFESSIONAL", {}).documents).toBe("WRITE")
  })

  it("honors an override to NONE", () => {
    const resolved = resolvePermissions("PROFESSIONAL", { documents: "NONE" })
    expect(resolved.documents).toBe("NONE")
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
