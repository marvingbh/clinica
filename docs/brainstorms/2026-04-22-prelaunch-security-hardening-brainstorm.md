# Brainstorm — Pre-Launch Security Hardening

**Date:** 2026-04-22
**Source:** `docs/security/2026-04-22-prelaunch-audit.md`
**Goal:** Clear the NO-GO verdict so the platform can onboard additional production tenants.

## What We're Building

A security hardening pass covering **all 18 launch blockers (B1–B18)** plus **9 selected mediums** (M1, M2, M3, M5, M6, M9, M11, M12, M14). Shipped as **four phased PRs** by theme so each PR is independently reviewable, deployable, and revertable. Total effort: ~5 engineering days.

The work does not introduce new features. It closes specific vulnerabilities documented in the audit: hardcoded secrets, missing rate limits, cross-clinic login collisions, stale JWT claims, template injection in NFS-e email, consent-bypass in group-session notifications, no right-to-erase path, and several smaller defense-in-depth gaps.

## Why This Approach

- **Phased PRs** keep reviews tight. Each PR ships one class of fix; if any single PR stalls, the others continue.
- **Selected mediums only** avoids scope creep while closing the LGPD-adjacent and defense-in-depth gaps that matter most for a healthcare SaaS (password strength, superadmin lifecycle, self-service password change, patient-view audit, real rate limiter).
- **Redis-backed rate limiter first** ensures every rate-limit fix in later phases is actually effective on Vercel's multi-instance runtime (the in-memory limiter fails open under load today).
- **JWT-preserving session fix** (shorten TTL + per-request DB re-check) over DB sessions: smaller diff, 8h worst-case revocation window, no schema migration during a security sprint.
- **Immediate secret rotation** (no grace period): acceptable breakage for a small live user base; patients with broken confirm links can call the clinic. Fastest path to actual security.
- **MVP LGPD purge** (anonymize + audit redact) instead of hard delete: preserves tax/repasse history integrity, satisfies LGPD Art. 18 for known cases, and ships in ~4h.

## Key Decisions

### Scope: Blockers + 9 selected mediums
In scope: all B1–B18, plus M1 (superadmin lifecycle), M2 (self-service password), M3 (password strength), M5 (`middleware.ts`), M6 (Redis rate limiter), M9 (`PATIENT_VIEWED`/`PATIENT_EXPORTED` audit), M11 (bounded pagination), M12 (intake enumeration), M14 (plaintext email in failed-login audit).
Out of scope (deferred): M4, M7, M8, M10, M13, M15, and all L-tier items.

### Session revocation: shorten TTL + per-request DB re-check
Set NextAuth `session.maxAge = 8h` and add a 30s-cached `SELECT isActive, role FROM User WHERE id = ?` inside `withAuth`/`withFeatureAuth`/`withAuthentication`. Keep JWT strategy. Worst-case revocation window drops from 30 days to 8 hours (or to seconds on any active request that triggers the cache refresh).

### Secret split: three distinct env vars, rotated immediately
`AUTH_SECRET` → `NEXTAUTH_SECRET` (NextAuth), `SUPERADMIN_JWT_SECRET` (superadmin), `APPOINTMENT_LINK_SECRET` (HMAC links). All three generated fresh and rotated in one deploy window (late Brazil night). In-flight patient confirm/cancel links stop working; patients redirected to call the clinic.

### LGPD erase: MVP (anonymize + redact), not hard delete
`POST /api/patients/[id]/purge` (ADMIN-only) overwrites `name`, `cpf`, `email`, `phone`, address fields, `notes`, `motherName`, `fatherName`, `billingCpf` on the `Patient` row with placeholders; redacts `AuditLog.oldValues/newValues` and `Notification.content` for that patient; writes a `PATIENT_PURGED` audit entry. No cascading deletes — tax/repasse history preserved.

### Rollout: four phased PRs

**Phase 0 (prep, ~2h):** Provision Upstash Redis (or Vercel KV) and migrate `src/lib/rate-limit.ts` to it. M6. Unblocks every rate-limit fix in later phases.

**Phase 1 — Auth & secrets (~1.5 days):** B1, B2, B3, B5, B8, B9, B11, B12, B16, B18, M1, M2, M3. Includes the three-way secret split and rotation, clinic-scoped login, per-request user re-check, rate limits on NextAuth + superadmin login, self-role guard on `/api/professionals/[id]`, cron-secret hardening, HMAC `timingSafeEqual`, Zod + current-password challenge on `/api/users/[id]`, `.env.example` cleanup + runtime guard.

**Phase 2 — Tenant isolation & consent (~1 day):** B7, B10, M9. Add `patients_others` feature flag (default `NONE` for PROFESSIONAL) gating clinic-wide patient and group reads; add consent checks to group-session regeneration/new-session flows; wire up `PATIENT_VIEWED` and `PATIENT_EXPORTED` audit events on patient GET, invoice zip export, and NFS-e PDF endpoints.

**Phase 3 — Public endpoints & integrations (~1.5 days):** B4, B6, B13, B14, B15, M5, M11, M12, M14. HTML-escape every interpolation in the NFS-e email template; rate-limit + de-oracle signup; no-fallback on confirm/cancel; Stripe webhook event dedup table; security headers in `next.config.ts`; `middleware.ts` to activate the `authorized` callback; bound `parseInt(limit)` site-wide; rate-limit the intake `GET` by slug; stop logging plaintext emails on failed logins.

**Phase 4 — LGPD right-to-erase (~1 day):** B17. Ship the purge endpoint, backfill `PATIENT_PURGED` into `AuditAction`, write `docs/security/data-retention.md` documenting the 5-year tax and 20-year clinical legal holds.

## Open Questions

None — all design decisions resolved during the brainstorm dialogue.

## Resolved Questions

| Question | Decision |
|----------|----------|
| Fix scope | Blockers + 9 selected mediums |
| Session revocation strategy | Shorten TTL + per-request DB re-check (keep JWT) |
| Secret rotation timing | Rotate immediately, acceptable breakage |
| LGPD erase shape | MVP: anonymize + redact, not hard delete |
| Rollout shape | Four phased PRs by theme |
