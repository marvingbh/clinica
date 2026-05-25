# Performance Instrumentation & Quick Wins

## Context

The system has no performance observability — no query timing, no request duration logging. Rather than adding logs everywhere and guessing, this plan takes a targeted approach:
1. Add lightweight instrumentation (Prisma slow query log + API timing) to catch future issues
2. Fix the bottlenecks we already identified through code analysis

Each fix is preceded by tests (mocked Prisma, following existing patterns from `handler.test.ts`) that verify current behavior before and after the change.

---

## Phase 1: Instrumentation

### 1A. Prisma Slow Query Logging
**File:** `src/lib/prisma.ts`

Add Prisma's built-in `log: [{ emit: 'event', level: 'query' }]` and a `$on('query')` handler that logs queries exceeding `SLOW_QUERY_THRESHOLD_MS` (env var, default 200ms) as structured JSON. Works in both dev console and Vercel logs.

### 1B. API Route Timing
**File:** `src/lib/api/with-auth.ts`

Add a `logRequestTiming()` helper that logs routes exceeding `SLOW_API_THRESHOLD_MS` (env var, default 500ms). Wrap the handler call in `withAuth`, `withAuthentication`, and `withFeatureAuth`. These cover all authenticated routes.

---

## Phase 2: Tests + Quick Wins

Each fix follows the pattern: **write test → verify it passes → make the change → verify test still passes**.

### Fix 1 — Eliminate subscription check DB query on every mutation

**Test:** `src/lib/api/with-auth.test.ts`
- Mock `@/lib/prisma` and `@/lib/auth`
- Test `checkSubscriptionAccess()` directly (extract and export it for testability):
  - GET requests → returns null (no check)
  - POST with `subscriptionStatus: "active"` → returns null
  - POST with `subscriptionStatus: "canceled"` → returns 403
  - POST with `subscriptionStatus: "trialing"` + valid `trialEndsAt` → returns null
  - POST with `subscriptionStatus: "trialing"` + expired `trialEndsAt` → returns 403

**Files to change:** `src/lib/api/with-auth.ts`, `src/lib/auth.ts`, `src/lib/auth.config.ts`, `src/types/next-auth.d.ts`
**Impact:** Removes 1 `prisma.clinic.findUnique()` per POST/PATCH/PUT/DELETE

**Fix:**
- Add `trialEndsAt` to the clinic select in `auth.ts:41` (already queries clinic there)
- Pass it through JWT → Session in `auth.config.ts` (lines 56, 68)
- Add `trialEndsAt: string | null` to `next-auth.d.ts` User, Session.user, and JWT
- Rewrite `checkSubscriptionAccess()` to accept `subscriptionStatus` + `trialEndsAt` from session instead of querying DB
- Update the 3 call sites (`withAuth:178`, `withAuthentication:243`, `withFeatureAuth:318`) to pass session values

### Fix 2 — Batch auto-reconcile suggestion enrichment (N+1)

**Test:** `src/lib/expenses/enrich-suggestions.test.ts`
- Extract enrichment logic from `auto-reconcile/route.ts:112-120` into a new pure function `enrichSuggestions()` in `src/lib/expenses/enrich-suggestions.ts`
- Test with mocked Prisma:
  - 3 suggestions → verifies only 2 DB calls (one `findMany` for transactions, one for expenses) instead of 6
  - Maps results correctly back to each suggestion
  - Handles missing transaction/expense gracefully (returns null)
  - Empty suggestions array → no DB calls

**Files to change:** new `src/lib/expenses/enrich-suggestions.ts`, update `src/lib/expenses/index.ts` barrel, update `src/app/api/financeiro/despesas/auto-reconcile/route.ts`
**Impact:** 20 suggestions = 40 queries → 2 queries

### Fix 3 — Batch reconciliation link creation

**Test:** `src/lib/bank-reconciliation/reconciliation.test.ts`
- Extract reconciliation orchestration from `reconcile/route.ts:84-184` into `src/lib/bank-reconciliation/reconcile-invoices.ts`
- The function receives pre-validated `links`, `invoiceMap`, `txMap`, `user`, `now`, and a Prisma transaction object
- Test with mock tx (same pattern as `generate-monthly-invoice.test.ts`):
  - Creates all links via `createMany` (1 call, not N)
  - Updates invoice statuses correctly (uses `computeInvoiceStatus` — already has its own tests)
  - Upserts usual payers with deduplication (same patient+payer combo → only one upsert)
  - Skips payer upsert when `payerName` is null

**Files to change:** new `src/lib/bank-reconciliation/reconcile-invoices.ts`, update barrel, update route
**Impact:** N sequential creates → 1 `createMany` + parallelize invoice updates

### Fix 4 — Batch recurring expense creation

**Test:** `src/app/api/jobs/generate-recurring-expenses/route.test.ts` (or extend existing expense tests)
- The function `generateExpensesFromRecurrence()` in `src/lib/expenses/recurrence.ts` is already pure and likely tested
- New test: verify the DB interaction layer uses `createMany` instead of a loop
- Mock Prisma tx, call the route logic, assert `tx.expense.createMany` called once with all inputs (not `tx.expense.create` called N times)

**Files to change:** `src/app/api/jobs/generate-recurring-expenses/route.ts`
**Impact:** N sequential `expense.create()` → 1 `createMany()`

### Fix 5 — Add pagination to expenses list

**Test:** `src/app/api/financeiro/despesas/route.test.ts`
- Mock Prisma, test the GET handler:
  - Default request → `findMany` called with `take: 50, skip: 0`
  - `?page=2&limit=20` → `findMany` called with `take: 20, skip: 20`
  - Response shape is `{ expenses: [...], total, page, limit }`
  - `limit` clamped to max 100
  - Also runs a parallel `count` query

**Files to change:** `src/app/api/financeiro/despesas/route.ts` + frontend `src/app/financeiro/despesas/page.tsx`
**Impact:** Prevents loading 500+ expenses into memory

### Fix 6 — Add pagination to invoices list

**Test:** `src/app/api/financeiro/faturas/route.test.ts`
- Same pattern as Fix 5 but for invoices
- Verify existing filter params (year, month, status, professional) still work alongside pagination

**Files to change:** `src/app/api/financeiro/faturas/route.ts` + frontend
**Impact:** Prevents unbounded invoice loads

---

## Deferred (revisit after instrumentation data)

- **Patient search functional index** — clinics have <500 patients; likely fast already
- **Invoice generation cleanup N+1** — complex billing logic, runs monthly
- **Frontend caching (SWR/React Query)** — significant effort, separate project
- **Composite DB indexes** — small cardinality tables, add only if instrumentation confirms need

---

## Execution Order

1. **Phase 1** (instrumentation) — no behavior changes, safe to ship first
2. **Fix 1** (subscription check) — highest impact, affects every mutation
3. **Fix 2** (auto-reconcile batch) — simple extraction + batch
4. **Fix 3** (reconcile batch) — extraction + createMany
5. **Fix 4** (recurring expenses batch) — simple createMany swap
6. **Fix 5-6** (pagination) — requires frontend changes too, do together

## Verification

1. After each fix: `npm run test` (all tests pass) + `npm run build` (type-checks pass)
2. After Phase 1: trigger key flows in dev, check console for `slow_query` / `slow_api` entries
3. After all fixes: manual test agenda, expenses, invoices, reconciliation in browser
4. Deploy and monitor Vercel logs

## Critical Files
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/api/with-auth.ts` — Auth middleware with subscription check (lines 54-86, 178, 243, 318)
- `src/lib/auth.ts` — NextAuth authorize (line 39-100)
- `src/lib/auth.config.ts` — JWT/session callbacks (lines 56, 68)
- `src/types/next-auth.d.ts` — Session type declarations
- `src/lib/subscription/status.ts` — `isReadOnly()`, `getSubscriptionAccess()`
- `src/app/api/financeiro/despesas/auto-reconcile/route.ts` — N+1 at lines 112-120
- `src/app/api/financeiro/conciliacao/reconcile/route.ts` — Sequential loops at lines 127-184
- `src/app/api/jobs/generate-recurring-expenses/route.ts` — Sequential creates at lines 50-65
- `src/app/api/financeiro/despesas/route.ts` — Unbounded findMany at line 41
- `src/app/api/financeiro/faturas/route.ts` — Unbounded findMany at line 47
- `src/lib/expenses/index.ts` — Expense domain module barrel
- `src/lib/bank-reconciliation/index.ts` — Reconciliation domain module barrel

## Reusable Functions (already exist)
- `computeInvoiceStatus()` — `src/lib/bank-reconciliation/reconciliation.ts`
- `normalizeForComparison()` — `src/lib/bank-reconciliation/matcher.ts`
- `isReadOnly()` / `getSubscriptionAccess()` — `src/lib/subscription/status.ts`
- `findAutoReconcileMatches()` — `src/lib/expenses/auto-reconcile.ts`
- `generateExpensesFromRecurrence()` — `src/lib/expenses/recurrence.ts`
