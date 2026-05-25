# Pre-Launch Security Audit — Clinica

**Date:** 2026-04-22
**Scope:** Full platform (auth, multi-tenant isolation, LGPD, public endpoints, integrations, secrets, headers)
**Method:** Three parallel specialist reviewers (security-sentinel agents), findings de-duplicated and prioritized.

## Go/No-Go Verdict

**NO-GO** for onboarding new tenants until the items marked "Launch blocker" are resolved. The core architecture is sound: every API route uses auth HOFs, every Prisma query is disciplined about `clinicId` scoping, secrets for bank/NFS-e credentials are encrypted at rest, Stripe signature verification is correct, no `dangerouslySetInnerHTML`/`eval`. The blockers below are specific, concrete, and fixable in under one engineering week of effort (excluding L-tier roadmap items).

---

## Launch blockers (fix before any new tenant)

| # | Severity | Finding | File | Effort |
|---|----------|---------|------|--------|
| B1 | Critical | Superadmin JWT falls back to hardcoded `"dev-secret"` when `AUTH_SECRET` is unset — CI even uses a different env name (`NEXTAUTH_SECRET`) raising deploy-miss risk | `src/lib/superadmin-auth.ts:5` | 5 min |
| B2 | Critical | Same `AUTH_SECRET` signs NextAuth sessions AND superadmin JWT AND patient-facing HMAC links — one leak compromises all three trust domains | `src/lib/superadmin-auth.ts:5`, `src/lib/appointments/appointment-links.ts:8` | 1 hr + rotation |
| B3 | Critical | Cross-clinic login collision: `findFirst({ where: { email, isActive: true } })` with no tenant selection — same email in two clinics resolves non-deterministically | `src/lib/auth.ts:27` | 4 hr (UX decision + migration) |
| B4 | Critical | HTML injection in NFS-e email template: `recipientName`, `descricao`, `clinicName`, etc. interpolated raw into `<html>…</html>` with no escaping; source data reachable via public intake | `src/lib/nfse/email-template.ts:37-129` | 30 min |
| B5 | High | No brute-force rate limit on NextAuth login OR superadmin login | `src/lib/auth.ts`, `src/app/api/superadmin/login/route.ts` | 2 hr |
| B6 | High | No rate limit on public signup; unlimited clinic/Stripe-customer creation + bcrypt CPU DoS + account-enumeration oracle (409 vs 200) | `src/app/api/public/signup/route.ts` | 1 hr |
| B7 | High | PROFESSIONAL role's `patients:READ` permission default lets any therapist read full records (CPF, notes, billing) of every patient in the clinic | `src/lib/rbac/permissions.ts:170`, `src/app/api/patients/route.ts`, `src/app/api/patients/[id]/route.ts`, `src/app/api/groups/route.ts` | 4 hr |
| B8 | High | Self-role-escalation: `PATCH /api/professionals/[id]` lacks the self-guard that `/api/users/[id]` has — user with `professionals:WRITE` can set `role:"ADMIN"` on themselves | `src/app/api/professionals/[id]/route.ts:54-177` | 15 min |
| B9 | High | JWT sessions cache role+permissions for 30 days; deactivated users keep access, role changes don't apply until expiry, logout doesn't revoke | `src/lib/auth.config.ts:11`, `src/lib/api/with-auth.ts:143` | 3 hr |
| B10 | High | Consent bypass in group-session regeneration/new-session: sends WhatsApp/email without checking `consentWhatsApp`/`consentEmail` | `src/app/api/groups/[groupId]/sessions/route.ts:389-412, 546-569` | 10 min |
| B11 | High | `/api/jobs/send-reminders` and `/api/jobs/extend-recurrences` accept `"Bearer undefined"` when `CRON_SECRET` env is empty — anyone with this knowledge can fire mass notifications / mass appointment gen | `src/app/api/jobs/send-reminders/route.ts:35-36`, `src/app/api/jobs/extend-recurrences/route.ts:27` | 10 min |
| B12 | High | HMAC signature on confirm/cancel links compared with `!==` (not `timingSafeEqual`) — timing oracle to forge signatures | `src/lib/appointments/appointment-links.ts:44` | 10 min |
| B13 | High | Confirm/cancel fallback leaks appointment metadata (`professionalName`, `scheduledAt`, modality) to anyone holding an appointment ID, even when signature fails | `src/app/api/public/appointments/cancel/route.ts:56-86`, `src/app/api/public/appointments/confirm/route.ts:56-90` | 30 min |
| B14 | High | No idempotency / event dedup on Stripe webhook; replayed or out-of-order events flip `subscriptionStatus` | `src/app/api/webhooks/stripe/handler.ts` | 2 hr (new table) |
| B15 | High | No security headers: no CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy — `/superadmin/login` is framable, HMAC link params leak via `Referer` | `next.config.ts` | 1 hr |
| B16 | High | `PATCH /api/users/[id]` has no Zod schema and lets any `users:WRITE` admin reset any user's password with no current-password challenge | `src/app/api/users/[id]/route.ts:45-127` | 45 min |
| B17 | High | No LGPD right-to-erase path: `DELETE /api/patients/[id]` is soft-delete only; PII remains in `Patient`, `AuditLog.oldValues/newValues`, and `Notification.content` | `src/app/api/patients/[id]/route.ts:499-539` + schema | 1-2 days |
| B18 | High | `.env.example` ships a default `AUTH_SECRET` value — if copied to production, every HMAC appointment link is forgeable; also every superadmin JWT is forgeable under B2 | `.env.example:37` | 10 min + runtime guard |

**Total estimated effort:** ~3 engineering days for everything except B17 (2 days standalone).

---

## Medium (fix before general availability)

| # | Finding | File | Effort |
|---|---------|------|--------|
| M1 | SuperAdmin row has no `isActive`, `lockedUntil`, `mfaSecret`, `failedLoginAttempts` — cannot disable a compromised superadmin without DB surgery | `prisma/schema.prisma:178-185` | 4 hr |
| M2 | No self-service password change endpoint (`/api/me/password` missing); users can't rotate their own password | absent | 2 hr |
| M3 | Password min length 6 chars; no complexity rules; no deny-list | `src/app/api/public/signup/route.ts:10`, `src/app/api/users/route.ts:71`, `src/app/api/users/[id]/route.ts:103` | 1 hr |
| M4 | Login timing oracle: "user not found" returns ~5ms, valid email returns ~250ms (bcrypt) → email enumeration | `src/lib/auth.ts:47-51` | 15 min (dummy bcrypt call) |
| M5 | `middleware.ts` does not exist → `authorized` callback in `auth.config.ts` is dead code; page-level defense-in-depth missing | missing `src/middleware.ts` | 30 min |
| M6 | In-memory rate limiter fails open on Vercel multi-instance — effective limit = `N × configured` | `src/lib/rate-limit.ts:27` | 3 hr (Redis/Upstash/KV) |
| M7 | `PATCH/DELETE /api/group-sessions/update` skips ownership check for PROFESSIONAL users; can edit groups they don't belong to (intra-clinic only) | `src/app/api/group-sessions/update/route.ts:60,95` | 15 min |
| M8 | `professional.findUnique` by body-supplied ID without clinic scope in repasse-recalc — no exploit today but brittle | `src/app/api/financeiro/faturas/recalcular-grupo/route.ts:46-49` | 5 min |
| M9 | No `PATIENT_VIEWED` / `PATIENT_EXPORTED` audit events — LGPD Art. 37 interpretation requires meaningful health-data access logs | `src/lib/rbac/audit.ts`, `GET /api/patients/[id]/route.ts`, `GET /api/financeiro/faturas/download-zip` | 2 hr |
| M10 | `UserPermission` unique constraint is `@@unique([userId, feature])`, not `[userId, clinicId, feature]` — app-level safe today but weaker than schema should express | `prisma/schema.prisma:751` | 30 min + migration |
| M11 | `parseInt(limit)` unbounded in intake-submissions and a few dashboard list endpoints — attacker can page at `limit=10_000_000` and exhaust DB | `src/app/api/intake-submissions/route.ts:15-16` and similar | 30 min |
| M12 | Intake slug enumeration: `GET /api/public/intake/[slug]` has no rate limit, returns clinic name/logo on hit → dictionary-enumerable | `src/app/api/public/intake/[slug]/route.ts:12-36` | 20 min |
| M13 | Signup 409 "email exists" is an account-enumeration oracle | `src/app/api/public/signup/route.ts:42-47` | covered by B6 |
| M14 | Plaintext email of failed-login attempts stored in `AuditLog.metadata` | `src/lib/auth.ts:57-65` | 15 min |
| M15 | `logoMime` stored from attacker-controlled `file.type` — constrained by allowlist today but drift-sensitive | `src/app/api/admin/settings/logo/route.ts:65` | 15 min |

---

## Low (hardening roadmap)

| # | Finding | File | Effort |
|---|---------|------|--------|
| L1 | Inter OAuth error echoes raw upstream body to error message | `src/lib/bank-reconciliation/inter-client.ts:68,74` | 15 min |
| L2 | `$executeRawUnsafe` in recurrence update — parameterized today via Zod but high-blast-radius | `src/app/api/appointments/recurrences/[id]/route.ts:297,306,327` | 1 hr |
| L3 | `patient.findMany({ where: { id: { in: patientIds } } })` relies on upstream clinic-scoping — "transitive trust" brittle | `src/app/api/financeiro/faturas/gerar/route.ts:82-90`, `src/app/api/financeiro/faturas/recalcular/route.ts:51` | 15 min |
| L4 | Patient names in `console.error` logs | `src/app/api/financeiro/faturas/gerar/route.ts:327`, `src/lib/financeiro/generate-patient-invoices.ts:153` | 10 min |
| L5 | Superadmin mutations (clinic deactivate, subscription update, trial extend) produce no `AuditLog` entries — post-incident forensics impossible | `src/app/api/superadmin/clinics/[id]/route.ts` | 2 hr |
| L6 | No Postgres row-level security — tenant isolation is purely application-enforced | all migrations | Multi-day roadmap |
| L7 | `next-auth@5.0.0-beta.30` in production — pin stable once released | `package.json` | pending upstream |
| L8 | Run `npm audit --omit=dev` before each deploy | — | 5 min + CI gate |

---

## What the audit confirmed is working well

- **All 125 API routes** use `withAuth` / `withFeatureAuth` / `withAuthentication` / `withSuperAdmin` / HMAC-signed / Stripe-signature guards — no raw unauthenticated handlers in protected namespaces.
- **Every Prisma `find*`/`update*`/`delete*` inspected** scopes by `clinicId` (with the ~3 exceptions called out as M8, L3).
- **All IDs are CUIDs** — no enumerable integer IDs.
- **Bcrypt cost 12** is acceptable.
- **Bank credentials and NFS-e certificates** use AES-256-GCM with a dedicated `ENCRYPTION_KEY` env var — `src/lib/bank-reconciliation/encryption.ts`. Clean implementation.
- **Stripe webhook** verifies signatures with `stripe.webhooks.constructEvent` against raw `req.text()` — correct.
- **NFS-e XML** uses `fast-xml-parser` with `processEntities: true` — no XML injection.
- **xml-crypto** canonicalization is `xml-exc-c14n` with `rsa-sha256` signing — current best practice.
- **Patient `@@unique([clinicId, cpf])`** — CPF uniqueness scoped per tenant, avoids cross-tenant probing.
- **Audit logging** covers all mutations (create/update/delete/status/invoice/NFS-e/repasse/intake). Gap is only on reads.
- **Consent is checked** in the reminder cron, appointment creation, cancel, resend-confirmation, and `lib/appointments/create-group-session.ts`. B10 is the single miss.
- **No `dangerouslySetInnerHTML`, `eval(`, `new Function(`, `String.raw`** anywhere in `src/`.
- **No hardcoded secrets** (`sk_live_`, `pk_live_`, `BEGIN PRIVATE KEY`) outside test fixtures and `.env.example`.
- **`.env` is gitignored**; only `.env.example` is committed.
- **Superadmin routes expose only aggregate `_count` per clinic** — no patient PII crosses the superadmin boundary.

---

## Suggested rollout

1. **Day 1 (blocker sprint, small fixes):** B1, B2 (rotate secrets), B4, B8, B10, B11, B12, B13, B18. Most are single-line or small function changes. ~4 hours.
2. **Day 2:** B3 (clinic-scoped login), B5 (rate limits), B6, B7 (PROFESSIONAL scope restriction), B9 (session lifetime + revocation), B14 (webhook idempotency), B15 (headers), B16 (users route validation). ~1 engineering day.
3. **Day 3-4:** B17 (right-to-erase endpoint + `PATIENT_PURGED` audit path + document retention policy for legal holds).
4. **Ongoing:** Medium items before GA. Low items as roadmap.
5. **Pre-deploy gate:** `npm audit --omit=dev` + smoke test of the HMAC link flow after secret rotation.

---

## File index (for quick nav)

- `src/lib/superadmin-auth.ts` — B1, B2
- `src/lib/appointments/appointment-links.ts` — B2, B12, B18
- `src/lib/auth.ts` — B3, B5, M4, M14
- `src/lib/auth.config.ts` — B9
- `src/lib/api/with-auth.ts` — B9
- `src/lib/nfse/email-template.ts` — B4
- `src/lib/rbac/permissions.ts` — B7
- `src/lib/rbac/audit.ts` — M9
- `src/lib/rate-limit.ts` — M6
- `src/lib/bank-reconciliation/inter-client.ts` — L1
- `src/app/api/auth/[...nextauth]/route.ts` — B5
- `src/app/api/superadmin/login/route.ts` — B5
- `src/app/api/public/signup/route.ts` — B6, M13
- `src/app/api/public/intake/[slug]/route.ts` — M12
- `src/app/api/public/appointments/{confirm,cancel}/route.ts` — B13
- `src/app/api/professionals/[id]/route.ts` — B8
- `src/app/api/users/[id]/route.ts` — B16
- `src/app/api/groups/[groupId]/sessions/route.ts` — B10
- `src/app/api/group-sessions/update/route.ts` — M7
- `src/app/api/jobs/{send-reminders,extend-recurrences}/route.ts` — B11
- `src/app/api/webhooks/stripe/handler.ts` — B14
- `src/app/api/patients/[id]/route.ts` — B7, B17, M9
- `src/app/api/financeiro/faturas/recalcular-grupo/route.ts` — M8
- `src/app/api/financeiro/faturas/{gerar,recalcular}/route.ts` — L3
- `src/app/api/appointments/recurrences/[id]/route.ts` — L2
- `src/app/api/admin/settings/logo/route.ts` — M15
- `src/app/api/intake-submissions/route.ts` — M11
- `src/app/api/superadmin/clinics/[id]/route.ts` — L5
- `prisma/schema.prisma` — M1, M10
- `next.config.ts` — B15
- `.env.example` — B18
