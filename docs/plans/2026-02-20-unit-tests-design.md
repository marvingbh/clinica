# Unit Tests Design

**Goal:** Add unit tests for pure business logic to catch regressions. No DB mocking in this first batch.

## Decisions

- **Test runner:** Vitest — fast, native TS/ESM, minimal config
- **Test location:** Colocated — `foo.test.ts` next to `foo.ts`
- **Scope:** Pure functions only (no Prisma mocking needed)

## Target Files (Priority Order)

1. **`src/lib/appointments/recurrence.ts`** — CRITICAL. Date calculations for recurring appointments (WEEKLY, BIWEEKLY, MONTHLY). Edge cases: month boundaries, leap years, exception management, rolling windows.

2. **`src/lib/audit/field-labels.ts`** — HIGH. Portuguese formatting (dates DD/MM/YYYY, currency R$, enum labels) and diff computation between old/new values.

3. **`src/lib/rbac/permissions.ts`** — HIGH. Role permission resolution, feature access levels, scope checks.

4. **`src/lib/rbac/authorize.ts`** — HIGH. Authorization logic: role checks, scope resolution, resource ownership rules.

5. **`src/lib/rate-limit.ts`** — MEDIUM-HIGH. Sliding window rate limiter with cleanup.

6. **`src/lib/notifications/types.ts`** — MEDIUM. Exponential backoff delay calculation.

## Setup

- Install: `vitest` (dev dependency)
- Config: `vitest.config.ts` with path aliases matching `tsconfig.json`
- Script: Add `"test"` and `"test:watch"` to package.json

## Out of Scope

- API route integration tests (requires Prisma/request mocking)
- Component tests (requires React testing setup)
- E2E tests
