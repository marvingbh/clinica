# Clinica Security Audit — 2026-05-31

## Remediation status — ALL APPLIED ✅ (build clean, 1791 tests passing)

Every confirmed CRITICAL/HIGH/MEDIUM/LOW finding was fixed, plus 4 extra cross-tenant
FK write-paths discovered during implementation. Changes were adversarially re-reviewed
by a second multi-agent pass; its findings (incl. a signup rate-limit regression and
missing test coverage) were also fixed. New tests: `auth-rate-limit`, `verify-cron`,
`appointment-links.verifySignature`, `with-superadmin` CSRF, superadmin-auth secret.

**Before deploying, set in the Vercel environment:**
- `AUTH_SECRET` — strong random (superadmin auth now THROWS if unset, by design)
- `CRON_SECRET` — random; cron jobs now fail closed without it
- `ENCRYPTION_KEY` — 64 hex chars (bank-credential encryption)
- `STRIPE_WEBHOOK_SECRET` — already required by the webhook
- The `LoginAttempt` migration applies automatically via `vercel-build` (`prisma migrate deploy`).

**Operational notes:** existing superadmin sessions are invalidated (re-login) due to the
key-derivation change. The CSP omits `unsafe-eval`; verify charts/PDF/PWA render in staging.

---



Multi-agent audit (20 agents over all 138 API routes + 11 security dimensions),
with every CRITICAL/HIGH finding adversarially verified, then **re-verified by hand**
against the real code. Many auto-confirmed findings were downgraded as false positives
(noted below) — the list here is the reconciled, ground-truthed set.

## Architecture summary
- NextAuth v5 (JWT) credentials + bcrypt; separate `jose` JWT cookie for superadmin.
- Tenant isolation is **per-handler**: `withFeatureAuth` checks feature access but does
  **no** clinic scoping. The convention `findFirst({id, clinicId}) → 404 → mutate by {id}`
  is followed correctly almost everywhere (financeiro, patients, groups, admin, billing
  all verified clean for cross-tenant reads/writes).
- Stripe webhook: signature verified correctly. All 4 cron jobs gated by `CRON_SECRET`.

## CONFIRMED — fix before publishing

### CRITICAL
1. **Superadmin JWT secret falls back to `"dev-secret"`** — `src/lib/superadmin-auth.ts:5`
   `process.env.AUTH_SECRET || "dev-secret"`. If `AUTH_SECRET` is ever unset, anyone can
   forge a superadmin cookie and control **every clinic**. (Latent: AUTH_SECRET is set in
   prod for NextAuth, but the silent fallback is unacceptable.) Fix: throw if unset —
   matches `appointment-links.ts:8-11`, which already does this correctly.

### HIGH
2. **No brute-force protection on login & superadmin login** — `src/lib/auth.ts`
   (NextAuth `authorize`) and `src/app/api/superadmin/login/route.ts`. Unlimited password
   guessing. The in-memory limiter exists but isn't applied here, and is per-instance/
   ephemeral on Vercel — ineffective. Needs a persistent (DB- or KV-backed) limiter.
3. **Cross-tenant PII via manual invoice** — `src/app/api/financeiro/faturas/manual/route.ts:38,65`.
   `patient.findUnique({where:{id:patientId}})` and the professional lookup omit `clinicId`.
   A clinic-A admin can mint an invoice referencing clinic-B's `patientId`; the stored
   `messageBody` embeds patient B's name + parents' names + professional name.
4. **No security headers** — no `middleware.ts`; `next.config.ts` sets none. Missing CSP,
   HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy,
   Permissions-Policy. Clickjacking + no transport hardening.
5. **Cross-tenant association via unvalidated foreign keys on write** — clinic-scoped FK
   ids accepted from the request body without verifying they belong to the caller's clinic:
   - `referenceProfessionalId` — `patients/route.ts:302` (create), `patients/[id]/route.ts:260` (update)
   - `categoryId` — `financeiro/despesas/[id]/route.ts:72`
   - `additionalProfessionalIds` — `appointments/recurrences/[id]/route.ts` (createMany), `groups/[groupId]/sessions`
   - `professionalProfileId` — `faturas/manual/route.ts:65`
   Impact: link your data to another tenant's row and read its name back via includes.
6. **Signup abuse + email enumeration** — `src/app/api/public/signup/route.ts`. No rate
   limit/CAPTCHA (spam clinic + Stripe-customer creation = cost); 409 message leaks whether
   an email is registered.

### MEDIUM
7. **CRON_SECRET fail-open** — `send-reminders` & `extend-recurrences` compare
   `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` without checking the secret is set;
   if unset, `Bearer undefined` passes. (The other two jobs guard with `!cronSecret ||`.)
8. **Intra-tenant horizontal authz** — `group-sessions/update` runs under `agenda_own` but
   doesn't restrict to the caller's own sessions, so a professional can edit/delete peers'
   group sessions within the clinic. (Cross-tenant is safe — `clinicId` is in the `where`.)
9. **`rbac/authorize.ts:98-102` patient ownership returns `true` unconditionally** — a
   PROFESSIONAL with "own"-scope patients can read any clinic patient, not only ones they
   treat. (Intra-tenant over-read.)
10. **Bank credential encryption uses one global key** — `bank-reconciliation/encryption.ts`.
    AES with a single shared `ENCRYPTION_KEY` for all clinics, no rotation/per-clinic
    derivation. (Encrypted at rest is baseline-OK; shared key is the weakness.)
11. ~~No edge auth middleware~~ — **RETRACTED**. Next.js 16 renamed `middleware.ts` to
    `proxy.ts`; `src/proxy.ts` already wires `NextAuth(authConfig)`, so the `authorized()`
    callback DOES run at the edge. (The initial audit only grepped for `middleware.ts`.)
12. **No CSRF tokens on superadmin state-changing routes** — mitigated by `sameSite=lax`
    cookie; low practical risk but worth a check on POST/PATCH.

### LOW / hardening
13. Non-constant-time HMAC compare in `appointment-links.ts:44` (`sig !== expectedSig`) — use `crypto.timingSafeEqual`.
14. `confirm` route's invalid-signature branch leaks confirmed-status + professional name for a guessed cuid.
15. Raw string-interpolated SQL in `recurrences/[id]/route.ts` (not injectable today — `modality` is zod-enum validated — but fragile; parameterize with `Prisma.sql`).
16. NextAuth session has no explicit short maxAge / rotation (default 30d).

## FALSE POSITIVES (auto-confirmed, refuted by hand — do NOT "fix")
- **Public confirm/cancel/lookup "IDOR"** — HMAC-signed (`verifyLink`) and rejected before any mutation; cannot forge a link for another appointment.
- **"update-by-id IDOR"** in `despesas/[id]`, `intake-submissions/[id]` (PUT), `faturas/[id]`, `patients/[id]` — each is preceded by a `findFirst({id, clinicId})` → 404 guard. Safe pattern.
- **`professionals/[id]` self-escalate to ADMIN** — gated by `professionals: WRITE`, which PROFESSIONAL has as `NONE` (403). Only ADMIN reaches it; setting roles there is intended.
- **`admin/permissions` privilege escalation** — validates target user's clinic + known feature; granting features is by-design admin power.
- **recurrences SQL injection** — `body` is zod-parsed; `modality` constrained to `ONLINE|PRESENCIAL`.
