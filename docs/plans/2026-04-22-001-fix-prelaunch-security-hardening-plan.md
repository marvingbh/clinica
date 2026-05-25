---
title: Pre-Launch Security Hardening
type: fix
status: active
date: 2026-04-22
origin: docs/brainstorms/2026-04-22-prelaunch-security-hardening-brainstorm.md
deepened: 2026-04-22
---

# Pre-Launch Security Hardening

## Enhancement Summary

**Deepened on:** 2026-04-22 via 10 parallel specialist agents (framework-docs, best-practices, security-sentinel, architecture-strategist, deployment-verification, data-migration-expert, code-simplicity-reviewer, performance-oracle, julik-frontend-races-reviewer, pattern-recognition-specialist).

### Key revisions applied inline
1. **HMAC rotation grace window extended 1h → 24h** with a `ROTATION_REASON=compromise` flag that skips the grace (industry norm is 24-72h per Auth0/Okta/HashiCorp).
2. **B17 purge column list and cascades expanded** — 10+ missing PII fields (`birthDate`, `schoolName/Unit/Shift`, `motherPhone`, `fatherPhone`, `nfseObs`, consent timestamps) and 7 dependent tables (`PatientPhone`, `PatientUsualPayer`, `IntakeSubmission`, `Appointment.notes`, `SessionCredit.reason`, `Invoice.notes`/`InvoiceItem.description`, **`AdnLog.requestBody/responseBody`** — major LGPD gap caught).
3. **B14 Stripe dedup pattern corrected** — `INSERT ... ON CONFLICT DO NOTHING` must run **before** the handler (atomic gate); plus handle crashed-mid-flight by allowing re-run when `processedAt IS NULL`.
4. **Frontend `apiFetch()` wrapper added to Phase 1** — central 401 handler prevents mid-session data loss and purge double-POST.
5. **`with-auth.ts` split required as Phase 1 prep** (already 324 lines, over the 200-line rule) — extract `resolveAuthUser()`, `checkSubscriptionAccess`, response helpers.
6. **M4 (login timing oracle) added to scope** — was silently dropped; dummy `bcrypt.compare` pattern now in Phase 1.
7. **B13 extended to include `/api/public/appointments/lookup`** (was only cancel + confirm).
8. **`PATIENT_VIEWED` narrowed to PII-export paths only** (not every patient GET) — drops projected 45M rows/year to ~1M.
9. **YAGNI cuts:** dropped top-1000 password list (length+classes enough), dropped SHA-256 of failed-login email (just drop the field), deferred `/api/auth/recover-slug` (admins tell users the slug), collapsed 5 audit actions to 3.
10. **Purge transaction restructured** — bulk redactions move OUT of main transaction into chunked batches (Vercel 10s function limit + Prisma 5s default would fail for long-history patients).
11. **Zod schema shape** switched from `issues[0].message` (6 routes) to `flatten()` (17 routes, the majority convention).
12. **HMAC helper stays in `src/lib/appointments/`** — `src/lib/crypto/` new bounded context was premature.

### New risks surfaced (mitigations added)
- **30s session-cache window lets a compromised admin purge/reset-password before revocation.** → Added explicit revocation set for ADMIN role + shortened cache to 5s for ADMIN/SuperAdmin.
- **`patients_others` self-grant risk.** → Added self-edit guard on `/api/admin/permissions`.
- **Fail-open rate-limiter gives bypass on Upstash outage.** → Added local in-memory fallback cap (100/min per key).
- **Single-admin purge destroys evidence.** → Upgraded MVP to require a 24h notification delay (email all admins, cancel link). Two-admin approval kept as v2.
- **Stripe webhook retention 30d is borderline** (Stripe retries up to 3d; forensics window). → Extended successful rows to 90d, add `error` column.

### Full Research Insights appended at the bottom of this document.

## Overview

Close the 18 launch blockers and 9 selected mediums identified in `docs/security/2026-04-22-prelaunch-audit.md` so the platform clears its pre-launch NO-GO verdict and can safely onboard additional tenants. Ships as **five ordered phases** (Phase 0 prep + four thematic PRs) with explicit cutover ordering derived from a SpecFlow gap analysis: session TTL shortening precedes secret rotation; clinic-scoped login precedes rotation; `middleware.ts` defense-in-depth moves into the first auth PR; tenant scope changes (B7) precede the erase endpoint (B17) so a misconfigured role cannot mass-purge. Total effort: ~5 engineering days of focused work, plus 1 night maintenance window for secret rotation.

## Problem Statement

Audit (2026-04-22) produced a go/no-go verdict of **NO-GO** for onboarding new tenants, citing 4 Critical + 14 High + 15 Medium + 8 Low findings. Headline issues:

- `AUTH_SECRET` falls back to a hardcoded `"dev-secret"` if unset, and the same secret signs three distinct trust domains (NextAuth sessions, superadmin JWTs, patient-facing HMAC links). A leak of one surface compromises all three.
- NextAuth's `authorize` callback does `findFirst({ where: { email } })` with no clinic selection, so the same email across two clinics authenticates non-deterministically.
- No login rate limit anywhere (NextAuth or superadmin), no signup rate limit, and unlimited clinic creation via public signup.
- JWT sessions cache `role`/`permissions`/`isActive` for 30 days — a deactivated user keeps full access; role downgrades take up to 30 days to land.
- `PROFESSIONAL` role default permission grants full clinic-wide patient reads (CPF, notes, billing), violating the "own only" design and LGPD data minimization.
- HTML injection in the NFS-e email template via user-controllable patient fields. HMAC compared with `!==` (timing oracle). Cron endpoints accept `"Bearer undefined"` when env is unset.
- No LGPD right-to-erase path.

The full file-by-file index is in the audit. This plan carries all blockers forward plus 9 defense-in-depth mediums; the rest are deferred (see brainstorm for rationale).

## Proposed Solution

Five phases, each mergeable independently, each with concrete acceptance criteria and integration tests.

1. **Phase 0 — Redis rate limiter prep (~2h).** Provision Upstash; replace the in-memory `rate-limit.ts` backend; add `auth`, `login`, `signup` presets. No other behavior changes. Must be deployed and verified in prod before Phase 1 ships.
2. **Phase 1 — Auth foundations & secrets (~1.5 days).** The internal user-experience PR. Sub-ordering below is important for UX continuity.
3. **Phase 2 — Tenant isolation & consent (~1 day).** Scope-tightening PR.
4. **Phase 3 — Public endpoints & integrations (~1.5 days).** External-surface PR.
5. **Phase 4 — LGPD right-to-erase (~1 day).** New capability.

## Technical Approach

### Architecture

**Session revocation (B9).** Keep NextAuth JWT strategy. Set `session.maxAge = 8h` in `src/lib/auth.config.ts`. In every request path that calls `auth()` (NextAuth HOFs `withAuth`/`withFeatureAuth`/`withAuthentication`, plus superadmin `getSuperAdminSession`), add a 30s-TTL per-user cache over `SELECT isActive, role FROM User WHERE id = ?`. Cache keyed by `user.id`, in-memory (node `Map<string, {at, row, pending?: Promise}>`). Cache stampede handled by pending-promise dedup. On miss → hit DB → write cache → compare against JWT claims → 401 if `isActive === false` or `role !== jwt.role`. Same pattern for `SuperAdmin`.

**Secret hierarchy (B1, B2).** Split `AUTH_SECRET` into three distinct env vars, all required at boot:
- `NEXTAUTH_SECRET` — NextAuth session JWT (primary consumer: `src/lib/auth.config.ts`).
- `SUPERADMIN_JWT_SECRET` — superadmin JWT (`src/lib/superadmin-auth.ts`).
- `APPOINTMENT_LINK_SECRET` — HMAC on confirm/cancel/lookup links (`src/lib/appointments/appointment-links.ts`).

Add `src/lib/env.ts` (new) that validates required secrets at module load; throw with a clear message if any is missing or equals a known dev placeholder string. Also validates `ENCRYPTION_KEY` and `CRON_SECRET`.

**Rate limiter (M6).** Upstash REST-based (`@upstash/ratelimit` + `@upstash/redis`). `src/lib/rate-limit.ts` keeps its current `checkRateLimit(key, config)` signature so callers don't change. Internally swap the in-memory `Map` for Upstash's sliding-window limiter. Two new preset keys in `RATE_LIMIT_CONFIGS`: `login` (5 / 15min per IP+email) and `signup` (3 / hour per IP). **Failure mode: fail-closed for `login`/`signup`/`superadmin-login`; fail-open for `publicApi`/`sensitive` with a `[rate-limit-unavailable]` warning log.** Fallback to in-memory map only when `NODE_ENV === "test"`.

**Audit taxonomy (M9, B17).** Add action constants to `src/lib/rbac/audit.ts`: `PATIENT_VIEWED`, `PATIENT_LIST_EXPORTED`, `INVOICE_BATCH_EXPORTED`, `PATIENT_PURGED`, `AUDIT_REDACTED`, `USER_PASSWORD_RESET_BY_ADMIN`, `USER_PASSWORD_CHANGED_SELF`. Standardize on fire-and-forget `.catch(() => {})` pattern for read-path audits (see `src/app/api/financeiro/despesas/route.ts:79` for canonical shape). Batch view audits in a single write-behind queue if volume warrants (defer — most clinics are low-traffic).

**Purge pattern (B17).** No hard delete. `POST /api/patients/[id]/purge` (ADMIN-only, requires zod body `{reason: string, confirmationName: string}` matching patient.name) inside a transaction:

1. Write `PATIENT_PURGED` `AuditLog` row first with `metadata: {reason, requestedByUserId}` and **no patient-identifying content**.
2. `UPDATE Patient SET name='[Paciente removido]', cpf=null, email=null, phone='', motherName=null, fatherName=null, billingCpf=null, billingResponsibleName=null, addressStreet=null, addressNumber=null, addressNeighborhood=null, addressCity=null, addressState=null, addressZip=null, notes=null, therapeuticProject=null WHERE id = ?`.
3. Redact `AuditLog.oldValues`/`newValues` for rows where `entityType='Patient' AND entityId=?`: overwrite PII keys with `"[redacted]"`; write `AUDIT_REDACTED` entry summarizing row count.
4. Redact `Notification.content` for `patientId=?`: overwrite with `"[conteúdo removido por solicitação LGPD]"`.
5. Invalidate any cached invoice PDFs and NFS-e XML for the patient (see Cache Invalidation under System-Wide Impact).

### Implementation Phases

#### Phase 0: Redis rate limiter prep (~2h)

Tasks:

- [ ] Create Upstash Redis database (free tier OK for current traffic). Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel env.
- [ ] `npm install @upstash/ratelimit @upstash/redis`.
- [ ] `src/lib/rate-limit.ts` — replace in-memory Map with `@upstash/ratelimit` sliding window. Preserve `checkRateLimit(key, config)` signature; keep `RATE_LIMIT_CONFIGS.publicApi` and `sensitive`; add `login` (`5 / 15min`), `signup` (`3 / hour`), `superadminLogin` (`3 / 15min`). Export a new `RateLimitFailureMode = "fail-open" | "fail-closed"` and accept it in `config`. Test-env fallback uses in-memory map keyed like today.
- [ ] `src/lib/rate-limit.test.ts` — update tests for the new interface; mock Upstash via dependency-injected client.

Files:
- `src/lib/rate-limit.ts` (rewrite)
- `src/lib/rate-limit.test.ts`
- `package.json`
- Vercel env config

**Phase 0 done when:** integration test hits Upstash preview; a second concurrent client sees the same window; fail-closed paths return 503 when the Upstash client is misconfigured; the `publicApi` fail-open path returns 200 with a warning log; dashboard shows rate-limit keys in Upstash UI.

#### Phase 1: Auth foundations & secrets (~1.5 days)

**Sub-ordering matters — the SpecFlow analysis flagged a double-disruption risk if B2 ships before B9 + B3.**

Task order within the PR:

0. **Prep — split `src/lib/api/with-auth.ts`** (324 lines, already over the 200-line rule). Extract:
   - `src/lib/api/auth-user.ts` → `resolveAuthUser(session)` helper + 30s-cached `Map<userId, {at, row, pending?}>` + pending-promise dedup + LRU cap at 10k entries. Single source of truth called by all three HOFs + `getSuperAdminSession`. **Cache TTL: 5s for ADMIN/SuperAdmin, 30s for PROFESSIONAL** — shorter window limits compromised-admin blast radius (see new risk in Enhancement Summary).
   - `src/lib/api/subscription-guard.ts` → `checkSubscriptionAccess`.
   - `src/lib/api/responses.ts` → 401/403/404 helpers.
   - Similarly, split `src/lib/rate-limit.ts` (will grow >200 lines) into `rate-limit.ts` (public API + configs), `rate-limit-upstash.ts`, `rate-limit-memory.ts` (test fallback).
1. **B9 first** — `session.maxAge = 8h`, `session.updateAge = 1h`; the DB re-check happens inside `resolveAuthUser()` from step 0. An **explicit in-memory revocation set** tracks user IDs deactivated in the last 60s — checked on every request ahead of the cache miss path so `isActive=false` revokes in <1s. Users now re-auth daily; this conditions them to brief re-logins before the cutover in (5).
2. **B18** — blank `AUTH_SECRET=` in `.env.example`; add runtime guard via `src/lib/env.ts` (thin aggregator that delegates to context-local validators — see architecture note). Rejects (a) missing secrets, (b) the known dev placeholder string in production, (c) **minimum entropy check**: secret must be ≥ 32 chars and not match a hardcoded list of obviously-weak values (`"dev-secret"`, `"changeme"`, `"secret"`, `"password"`, etc.).
3. **B1** — `src/lib/superadmin-auth.ts:5` fail-closed on missing secret. Delegates to `src/lib/env.ts` boot check.
4. **B3** — clinic-scoped login. **Run pre-deploy dedup SQL** (see Research Insights §Deployment Checklist) to find emails that exist in multiple clinics — email those users their slug out-of-band before the deploy to avoid support load. Add `clinicSlug` field to login form and to signup. Switch `authorize()` to `prisma.user.findUnique({ where: { clinicId_email: { clinicId, email } } })`. `User.clinicId` is already non-null (verified against schema). Frontend login form: disable submit while `isLoading`, clear `errorMessage` on every input change, trim+lowercase `clinicSlug` on submit. **`/api/auth/recover-slug` deferred** (YAGNI — admins tell their users the slug out-of-band; add later if support load demands it). Ship a "Esqueceu o workspace? Contate seu administrador" link on the login page instead.
5. **B2** — split secrets. Deploy new env vars alongside the old `AUTH_SECRET`; during a **24-hour window** (industry norm per Auth0/Okta/HashiCorp), `verifyLink()` in `appointment-links.ts` accepts signatures from either `APPOINTMENT_LINK_SECRET` or `LEGACY_APPOINTMENT_LINK_SECRET` (temporary env var). Sign only with the new one. After 24h, remove the legacy env var and redeploy. **If rotation is triggered by suspected compromise, set `ROTATION_REASON=compromise` and skip the grace window** — rotate atomically, bulk-resend confirm links to patients with upcoming appointments. Session JWTs (NextAuth + superadmin) do NOT get a grace window; they rely on B9's 8h TTL shipping first so users are already used to brief re-logins.
6. **B5** — `checkRateLimit` inside NextAuth `authorize()` keyed `login:${ip}:${email}` config `login`. Same for `/api/superadmin/login` POST with config `superadminLogin`. Both **fail-closed**.
7. **B6** — `checkRateLimit` at the top of `/api/public/signup` keyed `signup:${ip}`, config `signup`, fail-closed. Remove the 409 "email exists" oracle: drop the `findFirst` pre-check, rely on the `@@unique([clinicId, email])` constraint, return a generic 202 "Conta criada, verifique seu e-mail" on collision too — then send a real email to the collision target informing them someone tried to sign up with their email.
8. **B8** — `src/app/api/professionals/[id]/route.ts` PATCH: mirror the self-guard from `/api/users/[id]` (lines 62-68).
9. **B11** — `src/app/api/jobs/send-reminders/route.ts:35-36` and `src/app/api/jobs/extend-recurrences/route.ts:27`: use the `if (!cronSecret || authHeader !== ...)` guard that `generate-recurring-expenses` already has.
10. **B12** — `src/lib/appointments/appointment-links.ts:44` → `crypto.timingSafeEqual` on equal-length `Buffer.from(hex)`. Extract `compareHmac(a, b): boolean` into `src/lib/crypto/hmac.ts` (new) — same file will host future HMAC needs.
11. **B16** — `src/app/api/users/[id]/route.ts` PATCH: add zod schema; when `password` is in the body, require `currentPassword` of the *acting admin* and bcrypt-compare; if updating password for a different user, also log `USER_PASSWORD_RESET_BY_ADMIN` and send notification email to the target user.
12. **M1** — migration `add_superadmin_lifecycle`: add `isActive`, `lockedUntil`, `failedLoginAttempts`, `lastLoginAt`, `mfaSecret` to `SuperAdmin`. Enforce `isActive` in `getSuperAdminSession`. Increment `failedLoginAttempts` on each bad login; lock for 15 min after 5.
13. **M2** — `POST /api/me/password` with zod `{currentPassword, newPassword}`. Bcrypt-verify current; hash new; update; audit `USER_PASSWORD_CHANGED_SELF`. Add UI link under "Meu perfil".
14. **M3** — Replace `z.string().min(6)` with `z.string().min(12)` + `isStrongPassword()` helper (at-least-one each: lowercase, uppercase, digit). **Top-1000 list dropped per YAGNI** — length + 3-of-4 character classes is enough and doesn't rot. Apply to signup, `POST /api/users`, `PATCH /api/users/[id]`, `POST /api/me/password`, `PATCH /api/professionals/[id]`.
15. **M4** — login timing oracle. In `src/lib/auth.ts:47-51`, precompute a `DUMMY_HASH` constant at module load (a fixed bcrypt hash at cost 12, never matches anything). Always run `bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)` before the null/invalid branch. One exit point after the compare. Equalizes 5ms "user not found" against 250ms "user found + wrong password" — closes the email-enumeration oracle.
16. **M5** — `src/middleware.ts`: `export default auth` with matcher that excludes `/api/auth`, `/api/public`, `/api/webhooks`, `/api/superadmin/login`, `/api/jobs`, `/login`, `/signup`, `/confirm`, `/cancel`, `/intake/*`, `/_next/*`, `/favicon.ico`, `/manifest.json`, `/sw.js`, `/icons/*`, `/$`. Activates the `authorized` callback currently dead code in `auth.config.ts`. Kept minimal (≤50 lines); reusable checks live in `src/lib/api/`. **Verify no overlap with existing `src/proxy.ts`** before merging.
17. **M14** — `src/lib/auth.ts:57-65` — **remove the `email` field entirely** from the failed-login audit metadata payload (do NOT hash; correlation via `ip` + 5-min timestamp bucket is sufficient per YAGNI review).
18. **New: `apiFetch()` wrapper** at `src/shared/lib/api-fetch.ts`. Twelve-line fetch wrapper: on 401, stash in-flight form payload to `sessionStorage` under key `apiFetch:resume:${Date.now()}`, redirect to `/login?callbackUrl=...&resume=...`; on non-JSON response content-type after auth, treat as auth-lost (avoid "JSON parse error" UX); never auto-retry mutations. Refactor the ~6 highest-value mutation call sites (invoice create, session-note save, password change, purge, patient edit, appointment status change) to use it. Prevents silent data loss when B9's 8h TTL (or 30s DB revocation) flips `isActive=false` mid-session.

Files (major):
- `src/lib/env.ts` (new)
- `src/lib/auth.ts`
- `src/lib/auth.config.ts`
- `src/lib/api/with-auth.ts` + `src/lib/api/with-auth.test.ts`
- `src/lib/api/with-superadmin.ts` + test
- `src/lib/superadmin-auth.ts` + test
- `src/lib/password.ts` + new test
- `src/lib/crypto/hmac.ts` (new)
- `src/lib/appointments/appointment-links.ts` + test
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/auth/recover-slug/route.ts` (new)
- `src/app/api/superadmin/login/route.ts`
- `src/app/api/public/signup/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/professionals/[id]/route.ts`
- `src/app/api/me/route.ts` (extend) or `src/app/api/me/password/route.ts` (new)
- `src/app/api/jobs/send-reminders/route.ts`
- `src/app/api/jobs/extend-recurrences/route.ts`
- `src/app/login/page.tsx` + `src/app/signup/page.tsx` — add clinicSlug field
- `src/middleware.ts` (new)
- `prisma/schema.prisma` + new migration `add_superadmin_lifecycle`
- `.env.example`

**Phase 1 done when:**

- [ ] All three new secret env vars set in Vercel prod; `AUTH_SECRET` removed after grace window.
- [ ] Fresh login session cookie expires in 8h (observed via DevTools).
- [ ] Deactivate a test user → next request within 35s returns 401.
- [ ] Role-downgrade a test admin → next request returns 403 for admin-only routes within 35s.
- [ ] `curl -X POST /api/auth/callback/credentials` x 20 in 60s returns 429 after the 5th attempt.
- [ ] Same email in two clinics logs in to the correct clinic based on `clinicSlug`.
- [ ] `/api/professionals/[id]` PATCH cannot self-elevate role to ADMIN (E2E).
- [ ] `confirm/cancel` link signed with old secret accepted during the 1h grace, rejected after.
- [ ] `.env.example` contains `AUTH_SECRET=` (empty); CI fails if the dev placeholder string appears.
- [ ] `src/middleware.ts` 302's anonymous page requests to `/login`.
- [ ] Password strength blocks `123456`, `password`, and `abcdefg12345`.

#### Phase 2: Tenant isolation & consent (~1 day)

Tasks:

1. **B7** — Add `patients_others` and `groups_others` to `src/lib/rbac/types.ts:4` FEATURES tuple (naming consistent with existing `agenda_others` / `availability_others` pattern). Labels at `:23`. In `src/lib/rbac/permissions.ts:151-182` ROLE_DEFAULTS, set `patients_others: "NONE"`, `groups_others: "NONE"` for PROFESSIONAL, `"WRITE"` for ADMIN. **Also update `src/lib/rbac/permissions.test.ts` and `src/lib/rbac/authorize.test.ts`** — TypeScript exhaustiveness checks will force this.
   - Helper: `src/lib/patients/scope.ts` → `patientScopeFilter(user): Prisma.PatientWhereInput` returning `{}` for ADMIN or PROFESSIONAL with `patients_others:READ`, else `{ appointments: { some: { professionalProfileId: user.professionalProfileId } } }`. (Located in `patients/` bounded context, not `rbac/` — it's patient-domain logic that consults permissions, per DDD.)
   - `src/app/api/patients/route.ts` GET list, `src/app/api/patients/[id]/route.ts` GET/PATCH/DELETE (404, not 403, for out-of-scope IDs to avoid existence oracle).
   - `src/app/api/groups/route.ts` via a parallel `src/lib/groups/scope.ts` helper.
   - `src/app/api/intake-submissions/[id]/route.ts`, `src/app/api/financeiro/dashboard/insights/route.ts` — use the helper.
   - **Self-edit guard on `/api/admin/permissions` PATCH**: reject when `body.userId === acting.user.id` for the sensitive features `permissions:*`, `patients_others:*`, `groups_others:*`. Prevents a compromised admin silently self-upgrading. Emit `PERMISSION_SELF_EDIT_BLOCKED` audit entry on attempt.
   - Admin UI at `/configuracoes/usuarios` iterates `FEATURES` — the two new flags appear automatically. Ship empty-state copy for PROFESSIONAL users who lose patient-list access: "Você tem acesso apenas aos seus pacientes atribuídos. Peça ao administrador para liberar o acesso completo da clínica."
   - Document in the plan: asymmetry with `agenda_own`/`agenda_others` is intentional — `patients`/`groups` are the "own by default" features (like the existing `finances`/`expenses`); `_others` is the opt-in escalation.
2. **B10** — `src/app/api/groups/[groupId]/sessions/route.ts`: wrap the notification blocks at lines 389-412 and 546-569 in `if (patient.consentWhatsApp && patient.phone) {...}` / `if (patient.consentEmail && patient.email) {...}`. Patient select already includes these fields.
3. **M9** — `src/lib/rbac/audit.ts`: add one new `AuditAction` value → `BATCH_EXPORTED` (use `entityType` to distinguish `Patient` vs `Invoice`). **Audit only PII-export paths, not every patient GET** — YAGNI: at 50 clinics × 25 profs × 100 views/day we'd generate ~125k writes/day, ~45M rows/year. The `AuditLog` already captures mutations and the app's `updatedAt` fields trace engagement. LGPD Art. 37 covers "records of processing activities" via mutation logs; per-read access logs are not required for a small SaaS that is not a designated healthcare operator under ANPD. Fire-and-forget audit in:
   - `src/app/api/financeiro/faturas/download-zip/route.ts` GET — `BATCH_EXPORTED`, entityType `Invoice`.
   - `src/app/api/financeiro/faturas/[id]/pdf/route.ts` GET — `INVOICE_EXPORTED`.
   - `src/app/api/financeiro/faturas/[id]/nfse/pdf/route.ts` GET — `NFSE_EXPORTED`.
   - (A dedicated patient-history export endpoint would also audit; none exists today.)
   - **If the clinic later registers as a healthcare operator with ANPD**, add `PATIENT_VIEWED` with 5-min dedup window per (user, patient) — deferred.

**Phase 2 done when:**

- [ ] A test PROFESSIONAL user without `patients_others` hits `GET /api/patients` and gets only rows where they're a scheduled professional (count matches fixture).
- [ ] Same test user hits `/api/patients/[id]` for an un-assigned patient and gets 404.
- [ ] An ADMIN grants `patients_others:READ` to the test user → the same request now returns all clinic patients.
- [ ] Group-session regeneration with a fixture patient `consentWhatsApp=false` does NOT call the WhatsApp provider (assert in a vitest spy).
- [ ] Viewing a patient detail page appends a `PATIENT_VIEWED` `AuditLog` row.

#### Phase 3: Public endpoints & integrations (~1.5 days)

Tasks:

1. **B4** — `src/lib/nfse/email-template.ts` — add a `escapeHtml(s: string)` helper preserving UTF-8 (accent chars pass through; only `&<>"'` escaped). Apply to every `${…}` interpolation: `recipientName`, `descricao`, `clinicName`, `nfseNumero`, `emissionDate`, `codigoVerificacao`, `clinicPhone`, `clinicEmail`, `clinicAddress`, `valor`. Extend `email-template.test.ts` with injection payload (`<script>alert(1)</script>` → literal-escaped).
2. **B13** — `src/app/api/public/appointments/cancel/route.ts:56-86`, `.../confirm/route.ts:56-90`, **AND `.../lookup/route.ts`** (was missing from the original plan) — if `verifyLink` fails, return the generic error immediately. The "já cancelada"/"já confirmada"/appointment metadata UX hint moves behind successful signature verification only.
3. **B14** — New migration `add_stripe_webhook_event`: table

   ```prisma
   model StripeWebhookEvent {
     id          String    @id @default(cuid())
     eventId     String    @unique           // Stripe event.id
     type        String                       // e.g. "invoice.paid"
     createdAt   DateTime  @default(now())
     processedAt DateTime?                    // null = in-flight or crashed
     error       String?                      // populated when handler fails
     @@index([createdAt])                     // for cleanup
     @@index([type, createdAt])               // for ops debugging
   }
   ```

   Pattern in `src/app/api/webhooks/stripe/route.ts`:
   1. `stripe.webhooks.constructEvent(rawBody, sig, SECRET)`.
   2. **INSERT BEFORE handler** — atomic gate: `prisma.stripeWebhookEvent.create({ data: { eventId, type, createdAt: new Date(event.created * 1000) } })`. On `P2002` (duplicate): look up the existing row — if `processedAt !== null` return `200 {duplicate: true}`; if null (crashed mid-flight), allow the handler to re-run (idempotency is the handler's responsibility too; most Stripe objects support current-state re-fetch via API).
   3. Run handler; on success `UPDATE processedAt = NOW()`; on failure `UPDATE error = <message>` so the row stays visible and Stripe retries bring it back.

   Cleanup cron `/api/jobs/cleanup-webhook-events` (chunked deletes, keep 35 days minimum to cover Stripe's 3-day retry window + debugging margin, and keep **successfully-processed rows 90 days** for forensics).
4. **B15** — `next.config.ts` async `headers()` returning `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP allowing `'self'` + Stripe.js + Resend. Test PWA install (service worker must still register) and Sonner toasts.
5. **M11** — `src/app/api/intake-submissions/route.ts:15-16` and any other `parseInt(limit)` site: wrap in `Math.min(100, Math.max(1, parseInt(... || "20", 10) || 20))`. Quick grep: `parseInt(` in `src/app/api/**/route.ts`.
6. **M12** — `src/app/api/public/intake/[slug]/route.ts` GET — add `checkRateLimit('intake-get:'+ip, publicApi)` fail-open.

Files:
- `src/lib/nfse/email-template.ts` + test
- `src/app/api/public/appointments/{cancel,confirm,lookup}/route.ts`
- `src/app/api/webhooks/stripe/route.ts` + handler.ts
- `src/app/api/jobs/cleanup-webhook-events/route.ts` (new)
- `vercel.json` (new cron)
- `next.config.ts`
- `prisma/schema.prisma` + new migration `add_stripe_webhook_event`
- Various pagination sites

**Phase 3 done when:**

- [ ] Payload `<script>alert(1)</script>` in `guardianName` renders as `&lt;script&gt;alert(1)&lt;/script&gt;` in the NFS-e email HTML.
- [ ] Accented PT-BR characters (`ç`, `ã`, `é`) round-trip correctly.
- [ ] `POST /api/public/signup` with same payload twice in a minute returns 429 on the 4th attempt.
- [ ] `GET /api/public/appointments/lookup?sig=bogus` returns generic error without leaking `professionalName`.
- [ ] Replaying a Stripe webhook event with identical `event.id` returns 200 `{duplicate: true}` and the handler isn't invoked.
- [ ] `curl -I https://…/` shows HSTS, CSP, X-Frame-Options, etc.
- [ ] `GET /api/intake-submissions?limit=10000000` returns at most 100 rows.

#### Phase 4: LGPD right-to-erase (~1 day)

Tasks:

1. **B17** — Two-stage flow. **Stage 1: request** `POST /api/patients/[id]/purge/request` (ADMIN-only, `role === "ADMIN"` hard check — NOT feature-based). Zod body `{ reason: string().min(10), confirmationName: string() }`. Writes `PATIENT_PURGE_REQUESTED` audit row, emails all clinic admins with a cancel link valid 24h, returns a pending-request ID. **Stage 2: execute** — a cron (`/api/jobs/execute-pending-purges`, hourly) processes pending requests older than 24h whose cancel link wasn't clicked. Prevents single-compromised-admin destroying evidence of their own misconduct. (Two-admin approval deferred to v2.) Admin UI shows pending requests with cancel button.

2. **Execute transaction** (inside `/api/jobs/execute-pending-purges` for each due request):

   **Primary transaction (fast, atomic):**
   a. Write `PATIENT_PURGED` audit with `metadata: {reason, requestedByUserId, requestId}` — **no patient-identifying content**.
   b. `UPDATE Patient SET` (anonymize). **Full PII column list audited against `prisma/schema.prisma`**:
      - `name='[Paciente removido]', cpf=NULL, email=NULL, phone=''`
      - `motherName=NULL, fatherName=NULL, billingCpf=NULL, billingResponsibleName=NULL`
      - `addressStreet=NULL, addressNumber=NULL, addressNeighborhood=NULL, addressCity=NULL, addressState=NULL, addressZip=NULL`
      - `notes=NULL, therapeuticProject=NULL, nfseObs=NULL`
      - `birthDate=NULL, schoolName=NULL, schoolUnit=NULL, schoolShift=NULL, motherPhone=NULL, fatherPhone=NULL`
      - `firstAppointmentDate=NULL, lastFeeAdjustmentDate=NULL`
      - Consent timestamps: `consentWhatsAppAt=NULL, consentEmailAt=NULL, consentPhotoVideoAt=NULL, consentSessionRecordingAt=NULL` (leave the boolean flags for policy audit).
   c. `DELETE FROM PatientPhone WHERE patientId = ?` (FK cascade handles this if Patient were deleted, but since we're anonymizing, delete explicitly).
   d. `DELETE FROM PatientUsualPayer WHERE patientId = ?` (payer names are PII — often parent names).
   e. `DELETE FROM IntakeSubmission WHERE patientId = ?` (submissions contain `childName`, `guardianName`, `guardianCpfCnpj`, addresses — all PII).

   Explicit transaction config: `prisma.$transaction(fn, { timeout: 30_000, maxWait: 5_000, isolationLevel: 'ReadCommitted' })` + `SET LOCAL statement_timeout = '30s'` as first statement.

   **Post-transaction chunked redactions** (run in a loop of small independent transactions to avoid Vercel's 10s/60s function timeout and Prisma's 5s default):
   - `UPDATE AuditLog SET oldValues = jsonb_strip_pii_keys(oldValues), newValues = jsonb_strip_pii_keys(newValues) WHERE entityType='Patient' AND entityId=? LIMIT 1000` — loop until 0 rows affected.
   - `UPDATE Notification SET content='[conteúdo removido por solicitação LGPD]', subject=NULL, recipient='[redacted]', failureReason=NULL WHERE patientId=? LIMIT 1000`.
   - `UPDATE Appointment SET notes=NULL, cancellationReason=NULL WHERE patientId=?`.
   - `UPDATE SessionCredit SET reason='[redacted]' WHERE patientId=?`.
   - `UPDATE Invoice SET notes=NULL WHERE patientId=?`.
   - `UPDATE InvoiceItem SET description='[redacted]' WHERE invoiceId IN (SELECT id FROM Invoice WHERE patientId=?)`.
   - **`UPDATE AdnLog SET requestBody=NULL, responseBody=NULL WHERE invoiceId IN (SELECT id FROM Invoice WHERE patientId=?)`** — NFS-e request/response payloads contain full CPF/name/address; this is the **largest LGPD gap in the original plan**, now closed.
   - After all chunks complete, write `AUDIT_REDACTED` audit entry with `metadata: {patientId, rowCounts: {auditLog: N1, notification: N2, ...}}`.

   Invalidate any cached PDFs/XML on-disk (grep `writeFileSync` confirms current implementation regenerates on demand — no-op; verify once before production).

3. **Add `PATIENT_PURGE_REQUESTED`, `PATIENT_PURGE_CANCELLED`, `PATIENT_PURGED`, `AUDIT_REDACTED`** to `AuditAction`. These 4 are the only audit actions that may reference a patient ID after the purge without any other PII.

4. **UI:** admin-only modal in `/pacientes/[id]` with irreversible warning, required reason field (LGPD data-subject request ID), type-to-confirm input (name must match `patient.name`). Client-side state machine: `STATE_IDLE → STATE_CONFIRMING → STATE_SUBMITTING → STATE_DONE`; button disabled during submission to prevent double-POST. Server-side idempotency: if `patient.name === '[Paciente removido]'`, return 200 with the existing request's audit row ID instead of 400. Post-submit shows a toast with the `PATIENT_PURGE_REQUESTED` ID and confirmation email acknowledgement (receipt page YAGNI).
4. **`docs/security/data-retention.md`** — document:
   - Tax records retained 5 years per Brazilian CTN (invoices, NFS-e XML).
   - Clinical records retained 20 years per CFP (therapist notes).
   - Legal-hold override: purge anonymizes patient PII but preserves referential integrity for these records.
   - Resend retains message bodies ~30 days outside our control — patients should be advised.
   - Backup rotation policy: purged patients re-appear in any restore from a pre-purge backup. Ops runbook: any restore must re-apply the `PATIENT_PURGED` entries log.

**Phase 4 done when:**

- [ ] Purging a test patient: row anonymized; all Patient PII fields null/placeholder.
- [ ] `AuditLog` rows for that patient have `oldValues.cpf == "[redacted]"`, etc.
- [ ] An `AUDIT_REDACTED` audit row exists with `metadata: {rowCount: N}`.
- [ ] `PATIENT_PURGED` audit row exists with `metadata: {reason, requestedByUserId}` and no PII.
- [ ] `docs/security/data-retention.md` committed and linked from `CLAUDE.md`.
- [ ] Purge endpoint requires type-to-confirm and is ADMIN-only (non-admin gets 403).

## Alternative Approaches Considered

Rejected alternatives (full discussion in brainstorm: `docs/brainstorms/2026-04-22-prelaunch-security-hardening-brainstorm.md`):

- **Database sessions instead of JWT + re-check** (B9): bigger schema + per-request DB lookup for every route. Rejected for this sprint in favor of the cached re-check — 8h revocation window is acceptable for healthcare SaaS.
- **Hard-delete patient on LGPD erase** (B17): breaks tax and clinical legal-hold requirements. Rejected; anonymize-only.
- **Rotate secrets with full grace period / batch re-send of confirm links** (B2): multi-day ops effort for marginal UX gain. Rejected in favor of 1h accept-either window (revised up from "immediate" based on SpecFlow's patient-confusion concern).
- **One big hardening PR**: review fatigue, single-point-of-failure. Rejected in favor of phased shipping.

## System-Wide Impact

### Interaction graph

- **Per-request DB re-check (B9):** every authenticated request now calls `auth()` → NextAuth JWT decode → 30s-cached `prisma.user.findUnique(id, select:{isActive,role})`. On cache miss in a hot path, request latency +~10ms (indexed PK lookup). Across burst traffic the pending-promise dedup ensures one DB hit per user per 30s.
- **Secret rotation (B2):** every active JWT cookie becomes invalid when `AUTH_SECRET` is removed (after the 1h grace window for HMAC links). Every superadmin JWT cookie becomes invalid when superadmin secret is rotated. Every in-flight signed appointment link is invalid after the grace window.
- **Middleware.ts (M5):** every page request now runs `auth()` at the edge — same DB cache applies.
- **Rate limit on login (B5):** every POST to `/api/auth/callback/credentials` hits Upstash (~20ms round trip). Across the login page this is acceptable.
- **Audit on patient read (M9):** every `GET /api/patients/[id]` writes an `AuditLog` row (fire-and-forget). For a clinic with 50 professionals × 30 patient views/day = 1500 rows/day/clinic — tolerable. Monitor the `AuditLog` table growth; if > 1M rows across all tenants, partition by month.
- **Purge (B17):** triggers cascades — anonymize Patient → redact AuditLog (mass update) → redact Notification (mass update). For a patient with years of history this can touch 1000+ rows. Run in a single transaction with `SET LOCAL statement_timeout = '30s'`.

### Error & failure propagation

- Upstash unreachable: `login`/`signup`/`superadminLogin` fail-closed → 503 "Serviço temporariamente indisponível". `publicApi`/`sensitive` fail-open with warning log.
- DB unreachable during session re-check: fail-closed → 401 (user must re-login when DB returns). Deliberate — do not cache-indefinitely.
- Stripe webhook duplicate: 200 with `{duplicate: true}` (no error).
- Purge transaction partial failure: Prisma transaction rolls back all anonymization changes. Audit row not written. Endpoint returns 500 → operator retries.

### State lifecycle risks

- **Secret rotation timing window:** if the deploy completes but `AUTH_SECRET` is still in env, links signed with the old secret remain valid. Ops runbook must confirm removal after the 1h grace.
- **Session cache with stale role:** a user whose role changes sees the change within 30s of next request. Acceptable; document in the runbook.
- **Purge irreversibility:** once the transaction commits, there is no undo. `PATIENT_PURGED` audit is the permanent record. Backup restore requires re-running the log of purge actions — add to ops runbook.
- **`StripeWebhookEvent` table growth:** cleanup cron deletes rows older than 30 days. Bounded.
- **`patients_others` permission changes via `/api/admin/permissions`:** already audited (`PERMISSION_OVERRIDE_CHANGED`). Takes effect on the target user's next request after session cache expires — if the admin wants immediate revocation, they also set `isActive=false` → true (forces re-check).

### API surface parity

- **B7 scoping** applies to 5 routes (`/api/patients`, `/api/patients/[id]`, `/api/groups`, `/api/intake-submissions/[id]`, `/api/financeiro/dashboard/insights`). Any future route returning patient data must import and use a shared `scopeFilterForPatients(user)` helper (new in `src/lib/rbac/patient-scope.ts`).
- **Rate-limit presets** are reused: every future auth-adjacent public endpoint uses `login`/`signup`/`superadminLogin`/`publicApi`/`sensitive`. No inline rate-limit configs.
- **Zod + `safeParse + issues[0].message`** pattern — mirror `src/app/api/financeiro/faturas/[id]/route.ts:62-79` in every new route.

### Integration test scenarios

E2E / integration tests to add (not just unit):

1. **Secret rotation happy/sad path** — old session cookie 401's after rotation; new login works; old HMAC link during grace window works; old HMAC link after grace rejected with branded "link expirado" page.
2. **Deactivated user ≤30s revocation** — admin deactivates user; test user's next request within 35s returns 401.
3. **Clinic-scoped login disambiguation** — fixture: same email `alice@x.com` in clinic-a and clinic-b. Login with `{email, password, clinicSlug: "clinic-a"}` resolves to the clinic-a user.
4. **PROFESSIONAL scope** — fixture: ADMIN, assigned-PROF, unassigned-PROF all hit `GET /api/patients/[id]` of the same patient. ADMIN 200, assigned 200, unassigned 404.
5. **Consent respect in group sessions** — fixture patient with `consentWhatsApp=false`, `consentEmail=true`. Regenerating group sessions sends email but not WhatsApp (assert via spy).
6. **Purge end-to-end** — purge patient, assert anonymization, audit redaction, `PATIENT_PURGED` + `AUDIT_REDACTED` rows, receipt.
7. **Stripe webhook dedup** — POST same event twice; second returns `{duplicate: true}`, handler only called once.
8. **Multi-instance rate limit** — two concurrent clients share the Upstash counter; combined 7 requests over 1 min → 2 of them 429.
9. **Self-role-escalation guard** — PROFESSIONAL with `professionals:WRITE` PATCHes own id with `{role:"ADMIN"}` → 403.
10. **Password strength** — POST `/api/users` with `"123456"` → 400; `"P@ssw0rdStrong!"` → 201.

## Acceptance Criteria

### Functional

- [ ] All Phase 0–4 "done when" checklists pass.
- [ ] Re-running the audit script (or manual grep for each blocker's fingerprint) flags **zero** B-tier findings.
- [ ] All in-scope M-tier items show zero fingerprints too.

### Non-functional

- [ ] Cached session re-check adds < 15ms median latency to authenticated requests (measured via existing instrumentation).
- [ ] Upstash p99 latency < 50ms (Upstash console).
- [ ] `npm run build` clean; `npm run test` green (all 1400+ tests plus new).
- [ ] `npm audit --omit=dev` returns 0 critical.

### Quality gates

- [ ] Each phase PR has its own integration-test suite.
- [ ] `docs/security/data-retention.md` and updates to `CLAUDE.md` merged.
- [ ] Runbook entries: secret rotation cutover, deactivation revocation SLA, purge workflow, backup-restore purge-replay.

## Success Metrics

- **Audit re-run:** all 18 blockers + 9 in-scope mediums marked closed.
- **Security events observability:** failed-login, rate-limit 429s, purge actions, and secret-rotation events emitted as structured logs (tagged `security=true`). Post-launch, wire to Sentry or Axiom.
- **First 30 days post-launch:** 0 cross-tenant incidents; 0 auth-bypass reports; ≥1 deactivate-within-30s test in staging weekly.

## Dependencies & Prerequisites

- Upstash Redis account (free tier).
- Stripe webhook secret stable during rotation — no Stripe key change.
- Coordination window for Phase 1 cutover: ~2h late Brazil night.
- Frontend developer time for login-form slug addition and patient-purge modal.
- Existing tests as regression safety net (1400+ in repo).

## Risk Analysis & Mitigation

| Risk | Mitigation |
|------|------------|
| Secret rotation locks everyone out simultaneously | Ship B9 (8h TTL) first so users are already re-authing daily. Accept-either-secret window (1h) for HMAC links. Announce maintenance window. Rollback plan: redeploy with old `AUTH_SECRET` restored. |
| Session re-check DB load spike | 30s cache + pending-promise dedup = max 1 DB read per user per 30s. Indexed PK lookup, sub-millisecond in practice. |
| Upstash outage | Fail-closed on login/signup (acceptable downtime > credential stuffing). Fail-open + warn on non-auth. Monitor Upstash status. |
| B7 breaks frontend for PROFESSIONAL users relying on clinic-wide patient list | Test with real PROFESSIONAL fixture account in staging. Ship empty-state copy ("Você tem acesso apenas aos seus pacientes atribuídos"). ADMIN can grant `patients_others:READ` as per-user override. |
| PROFESSIONAL scope misconfiguration lets mass-purge (B17 × B7 interaction) | Purge endpoint enforces `role === "ADMIN"` directly (not just `patients:WRITE`) — confirmed in Phase 4 design. Even an elevated PROFESSIONAL cannot purge. |
| CSP breaks PWA / Sonner toasts | Dedicated test in staging: install PWA, trigger toasts, check dev tools console for CSP violations. Tune CSP with reports-only mode first (`Content-Security-Policy-Report-Only`) for 48h. |
| Password strength rejects legitimate existing passwords | Apply only to new passwords (create + change). Don't force reset on existing accounts. |
| `PATIENT_VIEWED` audit writes saturate `AuditLog` | Monitor; if volume problematic, add `AuditLog_readEvents` partition or write-behind buffer. |
| Backup restore re-populates purged PII | Document in `data-retention.md` that any restore must replay `PATIENT_PURGED` log against restored DB. Include automated script. |
| Purge request from an attacker-compromised ADMIN session | Type-to-confirm patient name + required reason + audit entry + optional 24h cooling-off flag (defer to v2 if UX friction is high). |

## Resource Requirements

- 1 senior engineer, ~5 working days.
- 1 frontend developer, ~1 day (login slug + purge modal + empty-state copy).
- Upstash free tier (free).
- 2h scheduled maintenance window for secret rotation.
- Staging environment with 2-clinic same-email fixture + PROFESSIONAL fixture users.

## Future Considerations

Deferred but noted for roadmap:

- **Postgres row-level security** (audit L6) — multi-day project; adds defense-in-depth on top of app-level `clinicId` enforcement.
- **MFA/TOTP for SuperAdmin** — M1 adds the column; UI/flow is follow-up.
- **`agenda_others` cleanup parity with `patients_others`** — ensure consistent UX across scope toggles.
- **Automated security CI** — run OWASP ZAP against preview deploys; commit `npm audit` baseline.
- **Password reset flow audit** — SpecFlow flagged this is unspecified. Check if `/esqueci-senha` exists; if yes, add rate limit + slug awareness; if no, ship it (blocks 8h-TTL users who forget password).
- **Full LGPD hard-delete path for patients with no retained tax/clinical history** — v2 of B17.

## Documentation Plan

- `docs/security/data-retention.md` — Brazilian CTN/CFP retention, Resend limits, backup policy.
- Update `CLAUDE.md` — link to retention doc; security conventions (rate limiter presets, secret env vars, audit events, password rules).
- Update `docs/security/2026-04-22-prelaunch-audit.md` with a "closed" column per finding as phases ship.
- Runbooks in `docs/runbooks/`: `secret-rotation.md`, `revoke-user-session.md`, `patient-purge.md`, `backup-restore-purge-replay.md` (new directory).

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-22-prelaunch-security-hardening-brainstorm.md](../brainstorms/2026-04-22-prelaunch-security-hardening-brainstorm.md). Key decisions carried forward:
  - Scope: blockers + 9 selected mediums.
  - Session strategy: JWT + 8h TTL + 30s DB re-check cache.
  - Secret split into 3 named env vars; rotate with 1h grace (revised from "immediate").
  - LGPD MVP: anonymize + redact, no hard delete.
  - 4 phased PRs + Phase 0 prep.

### Audit

- `docs/security/2026-04-22-prelaunch-audit.md` — 18 blockers, 15 mediums, 8 lows with file:line exploit paths and remediations.

### Internal References

- Rate limiter: `src/lib/rate-limit.ts:27`, `src/lib/rate-limit.ts:106-117`
- Auth HOFs: `src/lib/api/with-auth.ts:134,216,287`; `src/lib/api/with-superadmin.ts:12`
- NextAuth config: `src/lib/auth.ts:19-101`; `src/lib/auth.config.ts:11-70`
- Superadmin JWT: `src/lib/superadmin-auth.ts:5`
- HMAC links: `src/lib/appointments/appointment-links.ts:8,15,44`
- Audit module: `src/lib/rbac/audit.ts:8-77,186,207`
- Feature registration: `src/lib/rbac/types.ts:4-18,23`; `src/lib/rbac/permissions.ts:151-182`
- Encryption: `src/lib/bank-reconciliation/encryption.ts:6`
- Cron guards: `src/app/api/jobs/send-reminders/route.ts:35`, `src/app/api/jobs/extend-recurrences/route.ts:27`
- Security tests: `src/lib/rate-limit.test.ts`, `src/lib/appointments/appointment-links.test.ts`, `src/lib/rbac/{authorize,permissions,audit}.test.ts`, `src/lib/api/{with-auth,with-superadmin}.test.ts`, `src/lib/superadmin-auth.test.ts`
- Prior RBAC plan: `docs/plans/2026-02-19-permission-system-plan.md`
- Prior HMAC plan: `docs/plans/2026-02-23-refactor-hmac-signed-appointment-links-plan.md`

### External References

- NextAuth v5 session callbacks & `maxAge` — https://authjs.dev/reference/core#session
- Upstash rate limiter — https://github.com/upstash/ratelimit
- Stripe webhook idempotency — https://stripe.com/docs/webhooks#best-practices
- Node `crypto.timingSafeEqual` — https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
- Next.js security headers — https://nextjs.org/docs/app/api-reference/next-config-js/headers
- LGPD Art. 18 (direitos do titular) — https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- OWASP ASVS 4.0 — https://owasp.org/www-project-application-security-verification-standard/

### Conventions (from CLAUDE.md)

- Migrations: create files, never `prisma db push` (per user memory).
- Run `npm run build` before every commit (per user memory).
- Never use `useEffect` directly (component guideline).
- Files >200 lines require splitting.
- Domain logic in `src/lib/`; API routes are thin adapters.

---

## Research Insights & Revisions (2026-04-22 deepening)

This appendix consolidates findings from the 10 specialist agents referenced in the Enhancement Summary. Recommendations already applied to the plan body above are marked **[applied]**; items left for implementation-time judgement are marked **[guidance]**.

### R1. NextAuth v5 — JWT callback is the revocation pivot  [applied]

The `jwt` callback runs on every `auth()` call — the right place to do the fresh-from-DB lookup and stuff `isActive`/`role` into the token. The `session` callback then surfaces it on `session.user`. Returning falsy from `jwt` does NOT 401; enforcement happens in the HOF by reading `session.user.isActive`.

```ts
// src/lib/auth.config.ts
session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
callbacks: {
  async jwt({ token, user }) {
    if (user) { token.id = user.id; token.clinicId = user.clinicId; token.role = user.role }
    const fresh = await getCachedUserAuthState(token.id as string)  // 5s/30s cache
    if (!fresh) { token.isActive = false; return token }
    token.isActive = fresh.isActive
    token.role = fresh.role    // pick up role downgrades
    return token
  },
}
```

**Gotcha:** `updateAge` only triggers cookie rewrites on page loads / middleware, not API routes. Keep the DB re-check in the callback so API paths also see fresh state. NextAuth v5 defaults `NEXTAUTH_SECRET` to `AUTH_SECRET` — set `secret:` explicitly to avoid the dev-placeholder landmine.

### R2. Upstash `@upstash/ratelimit` sliding-window — canonical init  [applied]

`ephemeralCache` **must live at module scope** — inside the handler it's recreated every invocation and you pay full Redis cost per call. Use `timeout: 1000` so Upstash outages surface fast.

```ts
// src/lib/rate-limit-upstash.ts
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
const cache = new Map()                    // module-scope — critical
const redis = Redis.fromEnv()
export const limiters = {
  login:           new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m"), prefix: "rl:login",  ephemeralCache: cache, timeout: 1000 }),
  signup:          new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "1 h"),  prefix: "rl:signup", ephemeralCache: cache, timeout: 1000 }),
  superadminLogin: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "15 m"), prefix: "rl:sa",     ephemeralCache: cache, timeout: 1000 }),
}
```

**Key shape**: `login:${ip}:${email.toLowerCase()}` — dual-vector blocks both single-IP spray AND distributed stuffing on one account. Fail-closed on `login`/`signup`/`superadminLogin`; fail-open with a local in-memory cap (100/min per key) on `publicApi`/`sensitive`. Upstash free tier = 10k commands/day, comfortable for our login traffic.

### R3. Stripe webhook idempotency — INSERT before handler  [applied]

Dedupe on `event.id`. The **INSERT must be the atomic gate**, not an after-the-fact log — otherwise two concurrent retries both pass the "already processed?" check and double-provision.

```ts
try {
  await prisma.stripeWebhookEvent.create({ data: { eventId: event.id, type: event.type, createdAt: new Date(event.created * 1000) } })
} catch (e) {
  if (e.code === "P2002") {
    const row = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: event.id } })
    if (row?.processedAt) return NextResponse.json({ received: true, duplicate: true })
    // else: crashed mid-flight — let handler re-run; it must be idempotent
  } else throw e
}
try {
  await handleEvent(event)
  await prisma.stripeWebhookEvent.update({ where: { eventId: event.id }, data: { processedAt: new Date() } })
} catch (e) {
  await prisma.stripeWebhookEvent.update({ where: { eventId: event.id }, data: { error: String(e) } })
  throw e  // let Stripe retry
}
```

**Retention**: 35 days minimum to cover Stripe's 3-day retry + debugging margin; successfully-processed rows kept 90 days for forensics. **Never** use `express.raw`-style body parsing in Next App Router — `await req.text()` then pass string directly to `constructEvent`.

### R4. Next.js 16 security headers — canonical CSP for this stack  [applied]

```ts
// next.config.ts
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.stripe.com",
  "style-src 'self' 'unsafe-inline'",                      // Sonner injects style tags
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.upstash.io https://api.resend.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "worker-src 'self'", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  "frame-ancestors 'none'", "upgrade-insecure-requests",
].join("; ")
```

**Deploy as `Content-Security-Policy-Report-Only` first for 48h**; report-only doesn't catch SW-internal violations, so also smoke-test PWA install + offline mode + Sonner toasts with the enforcing policy in staging. **HSTS preload is a one-way door** — once submitted, removal takes months. `upgrade-insecure-requests` breaks any `http://` image URL in seed data — grep DB before launch.

### R5. bcrypt timing oracle — dummy-hash at module load  [applied]

Precompute `DUMMY_HASH` at **module load** at the same cost factor as real hashes; the `|| DUMMY_HASH` branch must produce no control-flow difference.

```ts
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8PzJmj0g3Wz.8Q3Y7lHjM9oN6K4J8u"
async function authorize({ email, password, clinicSlug }: Creds) {
  const clinic = await prisma.clinic.findUnique({ where: { slug: clinicSlug }, select: { id: true } })
  const user = clinic
    ? await prisma.user.findUnique({ where: { clinicId_email: { clinicId: clinic.id, email } }, select: { ... } })
    : null
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)  // always runs
  if (!user || !ok || !user.isActive) return null                              // single exit
  return { id: user.id, clinicId: user.clinicId, role: user.role }
}
```

The repo uses `bcryptjs` (Vercel-friendly, no native build); cost factor 12 gives ~250ms on Vercel. Dummy hash must be precomputed at same cost or timing gap reappears.

### R6. LGPD Art. 18 right-to-erase — Brazilian healthcare SaaS norms  [applied, expanded]

**Hard delete is NOT the industry pattern.** LGPD Art. 16 permits retention where there's a legal obligation (Art. 7, II), and healthcare explicitly invokes it:

- **Prontuário retention**: Lei 13.787/2018 + CFP Resolução 001/2009 + CFP 006/2019 → 20-year minimum for digitized psychological records. Clinical free-text (`Appointment.notes`, `therapeuticProject`) is covered.
- **Tax/fiscal retention**: CTN Art. 173-174 → 5 years for invoices, NFS-e XML, fiscal documents.

The anonymize-preserve-skeleton pattern (nullify PII, keep FK integrity, keep invoice rows) is canonical across Brazilian clinical SaaS (Conexa, iClinic, Feegow).

**Audit-log redaction as event**: the dominant pattern (AWS CloudTrail, Axiom, Stripe) treats audit rows as append-only but **allows in-place PII redaction of nested JSON payloads**, then records the redaction itself as a new audit event (`AUDIT_REDACTED`). Crucial: write `PATIENT_PURGED` **before** the redaction UPDATEs, not after, so intent-of-record survives UPDATE failure — reflected in the revised Phase 4 ordering.

**Out-of-scope processors**: Resend retains message bodies 30-90 days; Twilio 13 months; Stripe keeps customer objects per their retention policy. `docs/security/data-retention.md` must disclose these specific windows with a DPA clause.

**Backup-restore replay**: maintain a persistent `purge_log` (which `PATIENT_PURGED` audit rows naturally are). After any restore, run `npm run restore:apply-purge-log` — implement as a script, not a manual runbook step.

References:
- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm (LGPD)
- https://site.cfp.org.br/wp-content/uploads/2009/04/resolucao2009_01.pdf (CFP 001/2009)
- https://www.migalhas.com.br/depeso/367003/a-lgpd-e-o-tempo-de-guarda-dos-prontuarios-medicos (LGPD × 20yr reconciliation)

### R7. Secret rotation cutover playbook — industry norms  [applied]

Auth0 / Okta / HashiCorp Vault / Stripe all use the same pattern: **`next → current → previous → revoked`** state machine with overlapping validity windows. Never atomic cutover in multi-tenant prod.

**Grace window sizing by signature lifetime:**
- Session JWTs (8h TTL): grace ≥ 2× TTL. Our plan relies on B9 (8h TTL) shipping first + users self-refreshing, so atomic-cutover on session secret is OK.
- HMAC links: industry default is **24-72h**. Original plan's 1h was aggressive; revised to 24h. Implementation cost is identical (one extra env var `LEGACY_APPOINTMENT_LINK_SECRET`).

**Compromise-triggered rotation**: if the reason is suspected leak, skip the grace entirely and bulk-resend fresh links to patients with upcoming appointments. Gate via `ROTATION_REASON=compromise` env var.

**Operational discipline** (HashiCorp Vault PKI playbook):
- Two-person rule: a second engineer observes even if one performs.
- Keep the retired secret in a sealed password-manager entry for 7 days post-rotation, then destroy.
- Rotation is redeploy — never restore a revoked secret.

**Communication template** (PT-BR):
> Subject: Manutenção de segurança programada — login único necessário em [data]
>
> Na madrugada de [data], entre [HH:MM] e [HH:MM], realizaremos uma rotação de chaves de segurança. Após esta janela, **você precisará fazer login novamente uma única vez**. Nenhuma outra ação é necessária. Links de confirmação enviados nas últimas 24h continuarão válidos. Agendamentos, pacientes e dados financeiros não são afetados.

References: Auth0 signing-key rotation, Stripe webhook best-practices, Okta client-secret rotation, HashiCorp Vault PKI rotation.

### R8. Phase 1 Go/No-Go deployment checklist  [guidance]

Full SRE-ready runbook for the Phase 1 cutover. **Keep open in a second terminal during the 2h maintenance window.**

**Pre-deploy verification SQL (run in prod, save outputs):**

```sql
-- a. No duplicate (clinicId, email)
SELECT "clinicId", email, COUNT(*) FROM "User" GROUP BY 1,2 HAVING COUNT(*)>1;
-- Expected: 0 rows. Any → STOP.

-- b. clinicId populated 100%
SELECT COUNT(*) FROM "User" WHERE "clinicId" IS NULL;
-- Expected: 0.

-- c. Same-email-across-clinics population (these users need slug notice)
SELECT email, COUNT(DISTINCT "clinicId") c, array_agg(DISTINCT "clinicId") FROM "User" GROUP BY 1 HAVING c > 1;

-- d. Active clinics with slugs
SELECT COUNT(*) FROM "Clinic" WHERE slug IS NULL OR slug='';
-- Expected: 0.

-- e. Active superadmins
SELECT COUNT(*) FROM "SuperAdmin";

-- f. In-flight signed appointment links for grace sizing
SELECT COUNT(*) FROM "Appointment" WHERE status='AGENDADO' AND "scheduledAt" BETWEEN NOW() AND NOW() + INTERVAL '48 hours';
```

**Deploy sequence with proceed-if gates:**

| # | Action | Proceed if… | Abort if… |
|---|--------|-------------|-----------|
| a | Phase 0 Upstash in prod ≥24h | `UPSTASH_*` env set; curl signup 4× in 1min → 429; Upstash dashboard shows keys | 429 never fires |
| b | Merge+deploy B9 + B18 + B1 (non-destructive) | Vercel green; fresh login cookie `Max-Age≈28800`; 30d cookies still 200 | Build fails; `env.ts` throws |
| c | Set 3 new secrets alongside `AUTH_SECRET`; merge B3 + B5 + B2 accept-either | `/login` renders slug; login with slug→200; old HMAC link verifies (accept-either true); login 6× in 60s → 429 | Confirm/cancel 4xx >5% |
| d | **Wait 24h** (grace window) | Confirm/cancel 4xx <2%; failed-login ≤3× baseline; zero 5xx spikes | 4xx >5% for 5min → rollback to (b) |
| e | Remove `AUTH_SECRET` (and `LEGACY_APPOINTMENT_LINK_SECRET`); redeploy | Deploy green; new confirm link works; old session cookies from pre-(b) now 401 | 5xx spike on `/api/auth/*` |
| f | Verify old cookies dead | Old cookie → 401; fresh → 8h TTL | Old cookies still valid → secret not flipped |

**Monitoring (keep open):** Vercel p95 on `/api/auth/callback/credentials`, `/confirm`, `/cancel`; Upstash 429 rate; `AuditLog` LOGIN_FAILED rolling 5min baseline; patient confirm/cancel 4xx; AuditLog write count per 5min (drop = fire-and-forget failing).

**Rollback decision tree:**
- At (b): revert commit; users keep 30d cookie.
- At (c): revert + keep `AUTH_SECRET`; new secrets stay idle.
- At (e): re-add `AUTH_SECRET`, redeploy previous commit. Mid-flight signed links still verify (grace was active).
- Snapshot: Neon branch 30min before (b), 7-day retention.

**Post-deploy smoke tests:**
```bash
# Fresh login 8h TTL
curl -i -c /tmp/c.txt -X POST $PROD/api/auth/callback/credentials -d '...&clinicSlug=test-clinic'
grep session-token /tmp/c.txt  # Max-Age ≈ 28800

# Same-email-two-clinics disambiguation (requires fixture)
# 429 on 6th login attempt (same ip+email, 15min)
for i in 1 2 3 4 5 6; do curl -o /dev/null -w '%{http_code}\n' ...; done
# Expected: 200/401/401/401/401/429

# Self-role PATCH 403 (B8)
curl -X PATCH $PROD/api/professionals/$OWN_ID -H "Cookie: ..." -d '{"role":"ADMIN"}'
# Expected: 403

# Deactivation revocation ≤35s
UPDATE "User" SET "isActive"=false WHERE id='test-user';
# Wait 35s; test user's next request → 401

# Old-secret HMAC link post-(e) rejected without metadata leak
curl -i "$PROD/api/public/appointments/confirm?sig=OLD_SIG&..."
# Expected: generic error, no professionalName
```

**Downstream notifications:** clinic admins T-24h + T-1h PT-BR email; cron triggers unchanged (B11 hardens same env); Stripe webhook secret unchanged; on-call post in #eng-oncall at each gate.

### R9. Architecture refinements  [applied]

- **`src/lib/api/with-auth.ts` is 324 lines** — already over the 200-line rule. Must split as a **Phase 1 prep task** before adding the re-check logic. Extract `resolveAuthUser`, `checkSubscriptionAccess`, response helpers.
- **`src/lib/rate-limit.ts` will grow >200 lines** — split into `rate-limit.ts` (public API + configs), `rate-limit-upstash.ts` (adapter), `rate-limit-memory.ts` (test fallback).
- **`src/lib/env.ts` as thin aggregator** — calls context-local validators (`bank-reconciliation/encryption.ts` already throws on invalid `ENCRYPTION_KEY` — leave that in place; each domain exports `validateEnv()` invoked at boot). Avoids a god-module.
- **`scopeFilterForPatients` in `src/lib/patients/scope.ts`** (patient-domain logic that consults RBAC), not `src/lib/rbac/` — per DDD. Same pattern for `src/lib/groups/scope.ts`.
- **HMAC helper stays in `src/lib/appointments/appointment-links.ts`** (export `compareHmac` for reuse). Promoting to `src/lib/crypto/` was premature — no second consumer today.
- **Check `src/proxy.ts`** before shipping `src/middleware.ts` — confirm no overlap.

### R10. Pattern consistency fixes  [applied]

- **Zod schema error shape**: plan previously said use `issues[0].message` (6 routes). Repo majority is `{error:"Dados inválidos", details: parsed.error.flatten()}` (17 routes). **New routes in this plan use `flatten()`** for consistency.
- **Audit call style**: `await audit.log(...)` for mutations (15 call sites), fire-and-forget `.catch(()=>{})` for secondary/read signals (6 call sites in `financeiro/faturas/[id]/route.ts`). Plan aligns.
- **`/api/auth/recover-slug` → deferred** (was inconsistently placed outside `/api/public/`; and YAGNI says drop for MVP anyway).
- **Migration timestamps** are Prisma-generated 14-digit prefix: `YYYYMMDDHHMMSS_snake_case`. Matching recent migrations: `20260406000000_add_split_invoice_and_unique_credit`, `20260326200000_add_bank_balance`.
- **Feature naming asymmetry**: `patients_others`/`groups_others` differs from `agenda_own`/`agenda_others` only in that bare `patients`/`groups` are the "own" scope by default (matching existing `finances`/`expenses` pattern, not `agenda`). Documented in Phase 2 §B7.

### R11. Performance risk register  [applied where critical]

| Concern | Severity | Fix |
|---|---|---|
| Session cache N-instance multiplier: 500 users × 20 inst-hits/min = ~167 lookups/sec | Low at 50 clinics; monitor | LRU cap 10k entries on Map; add `AuthCacheWarm` metric for cold-start rate |
| `PATIENT_VIEWED` on every GET → 125k writes/day at realistic usage | Medium | **Narrowed to export paths only** — projected ~1M/yr vs 45M/yr |
| `AuditLog` growth 45M → 22GB/yr on Neon | Medium | Partition at **12M rows** (~3 months), not 1M as originally planned |
| **Purge transaction 50k+ UPDATE rows** | **HIGH** | **Moved bulk redactions OUT of main transaction into chunked batches** — bumped Prisma timeout to 30s; watched Vercel 10s/60s function limit |
| Middleware matcher incomplete | Low | Added `/favicon.ico`, `/manifest.json`, `/sw.js`, `/icons/*`, `/_next/data` |
| Upstash p99 latency | None at scale | — |
| CSP headers | None | Report-only first |

### R12. Frontend race mitigations  [applied]

- **Login form**: disable submit during `isLoading`, early-return in handler on double-submit, clear `errorMessage` on every input change, trim+lowercase `clinicSlug` on submit.
- **Admin password PATCH**: state machine `STATE_IDLE → STATE_VERIFYING → STATE_DONE`, disable during both phases, clear form via `key` reset on success.
- **PROFESSIONAL empty state**: distinguish `{patients:[]}` (200 empty) from HTML response (auth lost — redirect). In `apiFetch()`: sniff `response.headers.get("content-type")`; if not JSON, treat as auth lost.
- **Mid-session 401 data loss** (the "cheap feel" bug — therapist saving session notes while their cookie just expired): `apiFetch()` stashes mutation payload to `sessionStorage`, redirects to `/login?resume=...`, offers "recuperar rascunho" banner on return.
- **Purge double-POST**: client state machine + server idempotency (if `patient.name === '[Paciente removido]'` return 200 with existing request ID, not 400).
- **Middleware + PageTransition flash**: `apiFetch()` detects 401 before triggering client transition; skip `PageTransition` on navigations originating from 401.
- **CSP + PWA SW**: verify registration works on preview deploy with CSP applied; explicitly `worker-src 'self'` and `connect-src https://api.stripe.com https://api.resend.com`; Sonner + Stripe.js do NOT need `'unsafe-inline'` if you use nonces — but we accept it in exchange for simpler deploys.

### R13. New integration tests beyond the plan's original list  [applied as additions]

Added to Phase 1/2/3/4 test suites:

- Downgrade attack in 24h grace window (attempt signature forge with known-leaked old secret, confirm rejection once `LEGACY_APPOINTMENT_LINK_SECRET` is removed).
- 30s session cache staleness test: deactivate user → mutation attempt within 30s → 401 (via revocation set, not cache expiry).
- Stripe webhook handler crashes mid-flight → Stripe retries → handler re-runs successfully (confirms the crashed-mid-flight re-run path).
- Concurrent purge from two ADMINs (race on audit redaction) → one wins, second returns 200 idempotent.
- Rate-limit fail-open burst: simulate Upstash outage → local 100/min/key cap holds; log warning emitted.
- `/api/admin/permissions` PATCH with `userId === acting.user.id` on sensitive features → 403 + `PERMISSION_SELF_EDIT_BLOCKED` audit entry.
- `GET /api/public/appointments/lookup?sig=bogus` returns generic error without leaking `professionalName` / `scheduledAt` (parity with confirm/cancel).
- `apiFetch()` 401 handling: mutation payload stashed, redirect, resume banner on return.

### R14. Supplementary references & citations

**Framework docs:**
- NextAuth v5 session callbacks — https://authjs.dev/reference/core#session
- Upstash rate limiter — https://github.com/upstash/ratelimit
- Stripe webhooks best practices — https://stripe.com/docs/webhooks#best-practices
- `crypto.timingSafeEqual` — https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
- Next.js 16 headers — https://nextjs.org/docs/app/api-reference/next-config-js/headers

**Secret rotation:**
- Auth0 signing-key rotation — https://auth0.com/docs/get-started/tenant-settings/signing-keys/rotate-signing-keys
- Stripe keys best practices — https://docs.stripe.com/keys-best-practices
- Okta client-secret rotation — https://developer.okta.com/docs/guides/client-secret-rotation-key/main/
- HashiCorp Vault PKI rotation — https://developer.hashicorp.com/vault/docs/internals/rotation

**LGPD / Brazilian healthcare:**
- LGPD Arts. 16, 18 — https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- CFP Resolução 001/2009 — https://site.cfp.org.br/wp-content/uploads/2009/04/resolucao2009_01.pdf
- LGPD × 20-year prontuário reconciliation — https://www.migalhas.com.br/depeso/367003/a-lgpd-e-o-tempo-de-guarda-dos-prontuarios-medicos
- Redaction-as-event pattern (Axiom) — https://axiom.co/blog/the-right-to-be-forgotten-vs-audit-trail-mandates
- OWASP ASVS 4.0 — https://owasp.org/www-project-application-security-verification-standard/
