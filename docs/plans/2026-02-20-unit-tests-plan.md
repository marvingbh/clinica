# Unit Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Vitest and add colocated unit tests for the 6 most critical pure-function files in the system.

**Architecture:** Install Vitest with path alias support. Write colocated `.test.ts` files next to each source file. Mock Prisma enums as plain objects (they're just string constants). No database mocking needed — all targets are pure functions.

**Tech Stack:** Vitest, TypeScript, existing Next.js project

**Design doc:** `docs/plans/2026-02-20-unit-tests-design.md`

---

## Task 1: Vitest Setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add scripts + devDependency)

**Step 1: Install vitest**

Run: `npm install -D vitest`
Expected: Clean install, vitest added to devDependencies

**Step 2: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Prisma client enums are re-exported; point at generated client
      "@prisma/client": path.resolve(__dirname, "./node_modules/@prisma/client"),
    },
  },
})
```

**Step 3: Add test scripts to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Verify setup**

Run: `npx vitest run`
Expected: "No test files found" (clean exit, no config errors)

**Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest test runner setup"
```

---

## Task 2: Tests for `src/lib/notifications/types.ts`

**Files:**
- Create: `src/lib/notifications/types.test.ts`

This is the simplest file — a single pure function. Good warm-up.

**Step 1: Write the test file**

```typescript
// src/lib/notifications/types.test.ts
import { describe, it, expect } from "vitest"
import { calculateNextRetryDelay, DEFAULT_RETRY_CONFIG } from "./types"

describe("calculateNextRetryDelay", () => {
  it("returns baseDelay for attempt 1", () => {
    expect(calculateNextRetryDelay(1)).toBe(60000) // 1 min
  })

  it("doubles delay for each subsequent attempt", () => {
    expect(calculateNextRetryDelay(2)).toBe(120000) // 2 min
    expect(calculateNextRetryDelay(3)).toBe(240000) // 4 min
    expect(calculateNextRetryDelay(4)).toBe(480000) // 8 min
  })

  it("caps at maxDelayMs", () => {
    // attempt 6: 60000 * 2^5 = 1920000 > 3600000 max → capped
    expect(calculateNextRetryDelay(6)).toBe(3600000)
    expect(calculateNextRetryDelay(10)).toBe(3600000)
  })

  it("uses custom config when provided", () => {
    const config = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 5000 }
    expect(calculateNextRetryDelay(1, config)).toBe(1000)
    expect(calculateNextRetryDelay(2, config)).toBe(2000)
    expect(calculateNextRetryDelay(3, config)).toBe(4000)
    expect(calculateNextRetryDelay(4, config)).toBe(5000) // capped
  })
})

describe("DEFAULT_RETRY_CONFIG", () => {
  it("has expected defaults", () => {
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3)
    expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(60000)
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(3600000)
  })
})
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run src/lib/notifications/types.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/notifications/types.test.ts
git commit -m "test: add unit tests for notification retry delay calculation"
```

---

## Task 3: Tests for `src/lib/audit/field-labels.ts`

**Files:**
- Create: `src/lib/audit/field-labels.test.ts`

**Step 1: Write the test file**

```typescript
// src/lib/audit/field-labels.test.ts
import { describe, it, expect } from "vitest"
import { formatFieldValue, computeChanges, FIELD_LABELS } from "./field-labels"

describe("formatFieldValue", () => {
  it("returns em dash for null/undefined", () => {
    expect(formatFieldValue("name", null)).toBe("\u2014")
    expect(formatFieldValue("name", undefined)).toBe("\u2014")
  })

  it("formats booleans as Sim/Nao", () => {
    expect(formatFieldValue("isActive", true)).toBe("Sim")
    expect(formatFieldValue("isActive", false)).toBe("Nao")
  })

  it("formats appointment status enums", () => {
    expect(formatFieldValue("status", "AGENDADO")).toBe("Agendado")
    expect(formatFieldValue("status", "CONFIRMADO")).toBe("Confirmado")
    expect(formatFieldValue("status", "NAO_COMPARECEU")).toBe("Nao compareceu")
    expect(formatFieldValue("status", "CANCELADO_PROFISSIONAL")).toBe("Cancelado (Profissional)")
    expect(formatFieldValue("status", "CANCELADO_PACIENTE")).toBe("Cancelado (Paciente)")
  })

  it("formats modality enums", () => {
    expect(formatFieldValue("modality", "ONLINE")).toBe("Online")
    expect(formatFieldValue("modality", "PRESENCIAL")).toBe("Presencial")
  })

  it("formats appointment type enums", () => {
    expect(formatFieldValue("type", "CONSULTA")).toBe("Consulta")
    expect(formatFieldValue("type", "TAREFA")).toBe("Tarefa")
    expect(formatFieldValue("type", "REUNIAO")).toBe("Reuniao")
  })

  it("formats recurrence type enums", () => {
    expect(formatFieldValue("recurrenceType", "WEEKLY")).toBe("Semanal")
    expect(formatFieldValue("recurrenceType", "BIWEEKLY")).toBe("Quinzenal")
    expect(formatFieldValue("recurrenceType", "MONTHLY")).toBe("Mensal")
  })

  it("formats day of week numbers", () => {
    expect(formatFieldValue("dayOfWeek", 0)).toBe("Domingo")
    expect(formatFieldValue("dayOfWeek", 1)).toBe("Segunda-feira")
    expect(formatFieldValue("dayOfWeek", 6)).toBe("Sabado")
  })

  it("formats currency fields as BRL", () => {
    expect(formatFieldValue("price", 150.5)).toBe("R$ 150,50")
    expect(formatFieldValue("sessionFee", 200)).toBe("R$ 200,00")
    expect(formatFieldValue("price", 0)).toBe("R$ 0,00")
  })

  it("returns raw string for unknown fields", () => {
    expect(formatFieldValue("unknownField", "hello")).toBe("hello")
    expect(formatFieldValue("unknownField", 42)).toBe("42")
  })

  it("returns raw string for unknown enum values", () => {
    expect(formatFieldValue("status", "UNKNOWN_STATUS")).toBe("UNKNOWN_STATUS")
  })
})

describe("computeChanges", () => {
  it("returns empty array for null inputs", () => {
    expect(computeChanges(null, null)).toEqual([])
    expect(computeChanges(undefined, undefined)).toEqual([])
  })

  it("detects changed fields between old and new values", () => {
    const old = { name: "Alice", phone: "111" }
    const nw = { name: "Bob", phone: "111" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      field: "name",
      label: "Nome",
      oldValue: "Alice",
      newValue: "Bob",
    })
  })

  it("excludes internal fields like id, clinicId, createdAt", () => {
    const old = { id: "1", clinicId: "c1", createdAt: "a", name: "Alice" }
    const nw = { id: "2", clinicId: "c2", createdAt: "b", name: "Bob" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe("name")
  })

  it("handles fields only in oldValues (removed)", () => {
    const old = { name: "Alice", phone: "111" }
    const nw = { name: "Alice" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe("phone")
    expect(changes[0].oldValue).toBe("111")
    expect(changes[0].newValue).toBe("\u2014") // undefined → em dash
  })

  it("handles fields only in newValues (added)", () => {
    const old = { name: "Alice" }
    const nw = { name: "Alice", phone: "222" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe("phone")
    expect(changes[0].oldValue).toBe("\u2014")
    expect(changes[0].newValue).toBe("222")
  })

  it("uses FIELD_LABELS for known fields, raw name for unknown", () => {
    const old = { customThing: "a" }
    const nw = { customThing: "b" }
    const changes = computeChanges(old, nw)

    expect(changes[0].label).toBe("customThing") // no label mapped
  })

  it("formats enum values in changes", () => {
    const old = { status: "AGENDADO" }
    const nw = { status: "CONFIRMADO" }
    const changes = computeChanges(old, nw)

    expect(changes[0].oldValue).toBe("Agendado")
    expect(changes[0].newValue).toBe("Confirmado")
  })

  it("skips fields where JSON representation is equal", () => {
    const old = { notes: "hello" }
    const nw = { notes: "hello" }
    expect(computeChanges(old, nw)).toEqual([])
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/audit/field-labels.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/audit/field-labels.test.ts
git commit -m "test: add unit tests for audit field labels and change computation"
```

---

## Task 4: Tests for `src/lib/rbac/permissions.ts`

**Files:**
- Create: `src/lib/rbac/permissions.test.ts`

**Step 1: Write the test file**

```typescript
// src/lib/rbac/permissions.test.ts
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
    // ADMIN cannot delete clinics (no such permission)
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
    // Non-overridden features keep defaults
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
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/rbac/permissions.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/rbac/permissions.test.ts
git commit -m "test: add unit tests for RBAC permissions and feature access"
```

---

## Task 5: Tests for `src/lib/rbac/authorize.ts`

**Files:**
- Create: `src/lib/rbac/authorize.test.ts`

**Context:** The `authorize()` function depends on `hasPermission()` from `./permissions`. Since we're testing the real implementation (not mocking), this is an integration-style unit test that exercises the full RBAC chain.

**Step 1: Write the test file**

```typescript
// src/lib/rbac/authorize.test.ts
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
        resourceOwnerId: "prof-2", // matches professionalProfileId
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
        resourceOwnerId: "user-2", // matches user.id
      })
      expect(result.allowed).toBe(true)
    })

    it("user owns themselves", () => {
      // Professionals don't have user permissions, so test with a resource they can access
      // Actually, let's test the ownership logic directly via canPerform + authorize
      // A user resource ownership check: user.id === resourceOwnerId
      const admin = makeAdmin()
      // Admin has clinic scope for users, so ownership doesn't apply
      // Let's test with clinic resource instead (own scope for admin)
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
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/rbac/authorize.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/rbac/authorize.test.ts
git commit -m "test: add unit tests for authorization logic and ownership rules"
```

---

## Task 6: Tests for `src/lib/rate-limit.ts`

**Files:**
- Create: `src/lib/rate-limit.test.ts`

**Context:** The rate limiter uses an in-memory store with `Date.now()`. We use `vi.useFakeTimers()` to control time. The store is module-level, so tests need to use unique keys to avoid cross-contamination.

**Step 1: Write the test file**

```typescript
// src/lib/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "./rate-limit"

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const config = { maxRequests: 3, windowMs: 60000 }

  it("allows requests under the limit", async () => {
    const result = await checkRateLimit("test-under-limit", config)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.retryAfter).toBe(0)
  })

  it("tracks remaining count correctly", async () => {
    const r1 = await checkRateLimit("test-remaining", config)
    expect(r1.remaining).toBe(2)

    const r2 = await checkRateLimit("test-remaining", config)
    expect(r2.remaining).toBe(1)

    const r3 = await checkRateLimit("test-remaining", config)
    expect(r3.remaining).toBe(0)
  })

  it("blocks requests over the limit", async () => {
    await checkRateLimit("test-block", config)
    await checkRateLimit("test-block", config)
    await checkRateLimit("test-block", config)

    const result = await checkRateLimit("test-block", config)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it("allows requests again after window expires", async () => {
    await checkRateLimit("test-expire", config)
    await checkRateLimit("test-expire", config)
    await checkRateLimit("test-expire", config)

    // Blocked
    const blocked = await checkRateLimit("test-expire", config)
    expect(blocked.allowed).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(60001)

    const allowed = await checkRateLimit("test-expire", config)
    expect(allowed.allowed).toBe(true)
  })

  it("uses separate counters per key", async () => {
    await checkRateLimit("key-a", config)
    await checkRateLimit("key-a", config)
    await checkRateLimit("key-a", config)

    // key-a is full, key-b should still work
    const resultA = await checkRateLimit("key-a", config)
    expect(resultA.allowed).toBe(false)

    const resultB = await checkRateLimit("key-b", config)
    expect(resultB.allowed).toBe(true)
  })

  it("retryAfter reflects time until oldest request exits window", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    await checkRateLimit("test-retry", config)
    vi.advanceTimersByTime(10000) // +10s
    await checkRateLimit("test-retry", config)
    vi.advanceTimersByTime(10000) // +20s total
    await checkRateLimit("test-retry", config)

    // Now blocked — oldest request was at T+0, window is 60s
    // So retryAfter ≈ 60000 - 20000 = 40000
    const blocked = await checkRateLimit("test-retry", config)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(40000)
  })
})

describe("RATE_LIMIT_CONFIGS", () => {
  it("publicApi allows 10 per minute", () => {
    expect(RATE_LIMIT_CONFIGS.publicApi.maxRequests).toBe(10)
    expect(RATE_LIMIT_CONFIGS.publicApi.windowMs).toBe(60000)
  })

  it("sensitive allows 5 per minute", () => {
    expect(RATE_LIMIT_CONFIGS.sensitive.maxRequests).toBe(5)
    expect(RATE_LIMIT_CONFIGS.sensitive.windowMs).toBe(60000)
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/rate-limit.test.ts
git commit -m "test: add unit tests for rate limiter sliding window"
```

---

## Task 7: Tests for `src/lib/appointments/recurrence.ts`

**Files:**
- Create: `src/lib/appointments/recurrence.test.ts`

This is the most complex and critical file. Tests cover: validation, date calculation for all 3 recurrence types, month-boundary edge cases, exception management, day-shift logic, and formatting.

**Step 1: Write the test file**

```typescript
// src/lib/appointments/recurrence.test.ts
import { describe, it, expect } from "vitest"
import {
  validateRecurrenceOptions,
  calculateRecurrenceDates,
  calculateNextWindowDates,
  formatRecurrenceSummary,
  formatDate,
  isDateException,
  addException,
  removeException,
  calculateRecurrenceDatesWithExceptions,
  countActiveOccurrences,
  calculateDayShiftedDates,
} from "./recurrence"

// ---- Helpers ----

// Prisma enums are plain strings at runtime
const RecurrenceType = { WEEKLY: "WEEKLY", BIWEEKLY: "BIWEEKLY", MONTHLY: "MONTHLY" } as const
const RecurrenceEndType = { BY_DATE: "BY_DATE", BY_OCCURRENCES: "BY_OCCURRENCES", INDEFINITE: "INDEFINITE" } as const

describe("formatDate", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(formatDate(new Date(2026, 11, 31))).toBe("2026-12-31")
  })

  it("pads single-digit month and day", () => {
    expect(formatDate(new Date(2026, 2, 3))).toBe("2026-03-03")
  })
})

describe("validateRecurrenceOptions", () => {
  it("validates BY_OCCURRENCES requires occurrences >= 1", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 0,
      })
    ).toEqual({ valid: false, error: expect.stringContaining("pelo menos 1") })
  })

  it("validates BY_OCCURRENCES max is 52", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 53,
      })
    ).toEqual({ valid: false, error: expect.stringContaining("52") })
  })

  it("validates BY_OCCURRENCES accepts valid count", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 10,
      })
    ).toEqual({ valid: true })
  })

  it("validates BY_DATE requires endDate", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_DATE,
      })
    ).toEqual({ valid: false, error: expect.stringContaining("Data final") })
  })

  it("validates BY_DATE rejects invalid date", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_DATE,
        endDate: "not-a-date",
      })
    ).toEqual({ valid: false, error: expect.stringContaining("invalida") })
  })

  it("validates INDEFINITE requires nothing extra", () => {
    expect(
      validateRecurrenceOptions({
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.INDEFINITE,
      })
    ).toEqual({ valid: true })
  })
})

describe("calculateRecurrenceDates", () => {
  describe("WEEKLY", () => {
    it("generates correct number of weekly occurrences", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "09:00", 45, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 4,
      })
      expect(dates).toHaveLength(4)
      expect(dates.map((d) => d.date)).toEqual([
        "2026-03-02",
        "2026-03-09",
        "2026-03-16",
        "2026-03-23",
      ])
    })

    it("sets correct scheduledAt and endAt times", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "14:30", 60, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 1,
      })
      expect(dates[0].scheduledAt.getHours()).toBe(14)
      expect(dates[0].scheduledAt.getMinutes()).toBe(30)
      expect(dates[0].endAt.getHours()).toBe(15)
      expect(dates[0].endAt.getMinutes()).toBe(30)
    })
  })

  describe("BIWEEKLY", () => {
    it("generates dates 14 days apart", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "10:00", 45, {
        recurrenceType: RecurrenceType.BIWEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      })
      expect(dates.map((d) => d.date)).toEqual([
        "2026-03-02",
        "2026-03-16",
        "2026-03-30",
      ])
    })
  })

  describe("MONTHLY", () => {
    it("generates dates on same day of month", () => {
      const dates = calculateRecurrenceDates("2026-01-15", "09:00", 45, {
        recurrenceType: RecurrenceType.MONTHLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      })
      expect(dates.map((d) => d.date)).toEqual([
        "2026-01-15",
        "2026-02-15",
        "2026-03-15",
      ])
    })

    it("handles month-end edge case (Jan 31 → Feb 28)", () => {
      const dates = calculateRecurrenceDates("2026-01-31", "09:00", 45, {
        recurrenceType: RecurrenceType.MONTHLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      })
      expect(dates[0].date).toBe("2026-01-31")
      expect(dates[1].date).toBe("2026-02-28") // Feb has 28 days in 2026
      expect(dates[2].date).toBe("2026-03-31")
    })
  })

  describe("BY_DATE end type", () => {
    it("stops generating when past endDate", () => {
      const dates = calculateRecurrenceDates("2026-03-02", "09:00", 45, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_DATE,
        endDate: "2026-03-20",
      })
      // Mar 2, 9, 16 are within range; Mar 23 is past
      expect(dates).toHaveLength(3)
      expect(dates.map((d) => d.date)).toEqual([
        "2026-03-02",
        "2026-03-09",
        "2026-03-16",
      ])
    })
  })

  describe("INDEFINITE end type", () => {
    it("generates within 6-month rolling window", () => {
      const dates = calculateRecurrenceDates("2026-01-05", "09:00", 45, {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.INDEFINITE,
      })
      // Should have ~26 weeks (6 months)
      expect(dates.length).toBeGreaterThan(20)
      expect(dates.length).toBeLessThanOrEqual(52)

      // Last date should be before July 5, 2026
      const lastDate = new Date(dates[dates.length - 1].date + "T12:00:00")
      expect(lastDate.getTime()).toBeLessThanOrEqual(
        new Date("2026-07-06T00:00:00").getTime()
      )
    })
  })

  it("caps at 52 occurrences maximum", () => {
    const dates = calculateRecurrenceDates("2026-01-05", "09:00", 45, {
      recurrenceType: RecurrenceType.WEEKLY,
      recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
      occurrences: 100, // exceeds MAX_OCCURRENCES
    })
    expect(dates.length).toBeLessThanOrEqual(52)
  })
})

describe("calculateNextWindowDates", () => {
  it("generates weekly dates from last generated date", () => {
    const dates = calculateNextWindowDates(
      "2026-03-02", // Monday
      "09:00",
      45,
      RecurrenceType.WEEKLY,
      1, // Monday
      1  // 1 month extension
    )
    expect(dates.length).toBeGreaterThan(0)
    // All dates should be Mondays
    dates.forEach((d) => {
      const date = new Date(d.date + "T12:00:00")
      expect(date.getDay()).toBe(1)
    })
  })

  it("only includes dates matching dayOfWeek", () => {
    const dates = calculateNextWindowDates(
      "2026-03-02",
      "09:00",
      45,
      RecurrenceType.WEEKLY,
      3, // Wednesday
      1
    )
    dates.forEach((d) => {
      const date = new Date(d.date + "T12:00:00")
      expect(date.getDay()).toBe(3)
    })
  })
})

describe("exception management", () => {
  const exceptions = ["2026-03-09", "2026-03-16"]

  describe("isDateException", () => {
    it("returns true for dates in exceptions list", () => {
      expect(isDateException("2026-03-09", exceptions)).toBe(true)
    })

    it("returns false for dates not in list", () => {
      expect(isDateException("2026-03-02", exceptions)).toBe(false)
    })

    it("accepts Date objects", () => {
      expect(isDateException(new Date(2026, 2, 9), exceptions)).toBe(true)
    })
  })

  describe("addException", () => {
    it("adds a new date and returns sorted array", () => {
      const result = addException("2026-03-01", exceptions)
      expect(result).toEqual(["2026-03-01", "2026-03-09", "2026-03-16"])
    })

    it("does not duplicate existing exceptions", () => {
      const result = addException("2026-03-09", exceptions)
      expect(result).toEqual(exceptions) // same reference
    })
  })

  describe("removeException", () => {
    it("removes the date from the list", () => {
      const result = removeException("2026-03-09", exceptions)
      expect(result).toEqual(["2026-03-16"])
    })

    it("returns same content if date not found", () => {
      const result = removeException("2026-03-01", exceptions)
      expect(result).toEqual(exceptions)
    })
  })
})

describe("calculateRecurrenceDatesWithExceptions", () => {
  it("marks exception dates with isException=true", () => {
    const dates = calculateRecurrenceDatesWithExceptions(
      "2026-03-02",
      "09:00",
      45,
      {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 3,
      },
      ["2026-03-09"]
    )
    expect(dates[0].isException).toBe(false) // Mar 2
    expect(dates[1].isException).toBe(true)  // Mar 9 — exception
    expect(dates[2].isException).toBe(false) // Mar 16
  })
})

describe("countActiveOccurrences", () => {
  it("excludes exception dates from count", () => {
    const count = countActiveOccurrences(
      "2026-03-02",
      "09:00",
      45,
      {
        recurrenceType: RecurrenceType.WEEKLY,
        recurrenceEndType: RecurrenceEndType.BY_OCCURRENCES,
        occurrences: 4,
      },
      ["2026-03-09", "2026-03-16"]
    )
    expect(count).toBe(2) // 4 total - 2 exceptions
  })
})

describe("calculateDayShiftedDates", () => {
  it("shifts forward to next occurrence of new day", () => {
    // Monday Mar 2 → Wednesday Mar 4 (+2 days)
    const monday = new Date(2026, 2, 2, 9, 0)
    const mondayEnd = new Date(2026, 2, 2, 9, 45)

    const { scheduledAt, endAt } = calculateDayShiftedDates(monday, mondayEnd, 1, 3) // Mon→Wed
    expect(scheduledAt.getDay()).toBe(3)
    expect(scheduledAt.getDate()).toBe(4)
    expect(scheduledAt.getHours()).toBe(9)
    expect(endAt.getDate()).toBe(4)
  })

  it("shifts to next week when new day is same as current", () => {
    // Monday → Monday = +7 days
    const monday = new Date(2026, 2, 2, 9, 0)
    const mondayEnd = new Date(2026, 2, 2, 9, 45)

    const { scheduledAt } = calculateDayShiftedDates(monday, mondayEnd, 1, 1)
    expect(scheduledAt.getDate()).toBe(9) // next Monday
  })

  it("shifts to next week when new day is earlier in week", () => {
    // Wednesday → Monday = +5 days (not -2)
    const wednesday = new Date(2026, 2, 4, 9, 0)
    const wednesdayEnd = new Date(2026, 2, 4, 9, 45)

    const { scheduledAt } = calculateDayShiftedDates(wednesday, wednesdayEnd, 3, 1) // Wed→Mon
    expect(scheduledAt.getDay()).toBe(1)
    expect(scheduledAt.getDate()).toBe(9) // next Monday
  })

  it("preserves time across the shift", () => {
    const fri = new Date(2026, 2, 6, 14, 30)
    const friEnd = new Date(2026, 2, 6, 15, 15)

    const { scheduledAt, endAt } = calculateDayShiftedDates(fri, friEnd, 5, 2) // Fri→Tue
    expect(scheduledAt.getHours()).toBe(14)
    expect(scheduledAt.getMinutes()).toBe(30)
    expect(endAt.getHours()).toBe(15)
    expect(endAt.getMinutes()).toBe(15)
  })
})

describe("formatRecurrenceSummary", () => {
  it("formats weekly with occurrences", () => {
    const summary = formatRecurrenceSummary(
      RecurrenceType.WEEKLY,
      RecurrenceEndType.BY_OCCURRENCES,
      10
    )
    expect(summary).toBe("Semanal - 10 sessoes")
  })

  it("formats biweekly with end date", () => {
    const summary = formatRecurrenceSummary(
      RecurrenceType.BIWEEKLY,
      RecurrenceEndType.BY_DATE,
      undefined,
      "2026-06-30"
    )
    expect(summary).toContain("Quinzenal")
    expect(summary).toContain("ate")
  })

  it("formats monthly indefinite", () => {
    const summary = formatRecurrenceSummary(
      RecurrenceType.MONTHLY,
      RecurrenceEndType.INDEFINITE
    )
    expect(summary).toBe("Mensal - sem data de fim")
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/appointments/recurrence.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/appointments/recurrence.test.ts
git commit -m "test: add unit tests for appointment recurrence calculations"
```

---

## Task 8: Full Test Suite Verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All test files pass, clean output

**Step 2: Verify build still works**

Run: `npm run build`
Expected: Clean build (test files should be excluded)

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues from test suite verification"
```
