---
title: "refactor: Replace AppointmentToken table with HMAC-signed URLs"
type: refactor
date: 2026-02-23
---

# refactor: Replace AppointmentToken table with HMAC-signed URLs

## Overview

Replace the `AppointmentToken` database table with stateless HMAC-signed URLs for patient confirm/cancel links. Eliminates a growing table (2 rows per appointment, no cleanup), removes DB lookups on patient clicks, and simplifies token creation/regeneration logic across ~18 files.

## Problem Statement

Every appointment creates 2 DB rows in `AppointmentToken`. The reminder cron adds 2 more per run (existing bug — no dedup). No cleanup job exists, so the table grows indefinitely. Token regeneration on reschedule/resend adds complexity in transactions. All of this is unnecessary — the same security can be achieved with a stateless HMAC signature.

## Proposed Solution

Sign appointment links with HMAC-SHA256 using `AUTH_SECRET`. The URL encodes `appointmentId`, `action`, and `expiresAt`. The server verifies by recomputing the signature — zero DB overhead.

### HMAC Design

**Signed payload:** `"${appointmentId}:${action}:${expires}"`
- `appointmentId`: CUID (e.g., `clxyz123...`)
- `action`: `"confirm"` or `"cancel"` — **must** be in the signature to prevent cross-action forgery
- `expires`: Unix timestamp in seconds (e.g., `1709337600`)
- Delimiter: `:` (safe — CUIDs never contain colons)
- Algorithm: HMAC-SHA256
- Secret: `process.env.AUTH_SECRET`

**URL format (action inferred from path, not query param):**
```
/confirm?id={appointmentId}&expires={timestamp}&sig={hmac_hex}
/cancel?id={appointmentId}&expires={timestamp}&sig={hmac_hex}
```

**API contract:**
- `GET /api/public/appointments/lookup?id=...&action=confirm|cancel&expires=...&sig=...` → returns appointment details
- `POST /api/public/appointments/confirm` body: `{ id, expires, sig }`
- `POST /api/public/appointments/cancel` body: `{ id, expires, sig, reason? }`

**Expiry:** `appointmentScheduledAt + 24 hours` (same as today).

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single-use enforcement | No (idempotent) | Confirming twice is a no-op — appointment is already CONFIRMADO |
| Transition period | Hard cutover | Old links break but tokens were 24h-lived anyway. Admin can resend. |
| Legacy GET routes | Delete | `/api/appointments/confirm` and `/cancel` (GET) removed entirely |
| HMAC secret | `AUTH_SECRET` env var | Already exists, sufficient strength |
| Action in URL | Inferred from path | `/confirm` → "confirm", `/cancel` → "cancel". Action IS in HMAC payload for security. |
| API response tokens | Remove | `tokens` field removed from create/edit appointment responses — links only useful in notifications |
| AUTH_SECRET missing | Throw clear error | `signLink()` and `verifyLink()` throw if `AUTH_SECRET` is not set |

## Acceptance Criteria

- [x] New `appointment-links.ts` module with `signLink()`, `verifyLink()`, `buildConfirmUrl()`, `buildCancelUrl()`
- [x] Unit tests for: valid round-trip, expired rejection, tampered signature, wrong action, missing secret
- [x] Public confirm/cancel/lookup endpoints verify HMAC instead of DB lookup
- [x] Confirm page (`/confirm`) and cancel page (`/cancel`) parse new URL params (`id`, `expires`, `sig`)
- [x] "Already confirmed"/"Already cancelled" UX preserved (check appointment status directly)
- [x] All token creation calls removed from: appointment creation, reschedule, resend, reminder cron, recurrence extension, group sessions
- [x] `token-service.ts` deleted
- [x] Legacy GET confirm/cancel routes deleted
- [x] `AppointmentToken` model removed from schema, DB migration drops table
- [x] `tokens` relation removed from `Appointment` model
- [x] `npm run test` passes
- [x] `npm run build` passes (no dangling imports)

## Implementation Plan

### Phase 1: Create HMAC signing module (TDD)

**Create `src/lib/appointments/appointment-links.test.ts`:**
```typescript
// Test cases:
// - signLink produces URL with id, expires, sig params
// - verifyLink returns true for valid signature
// - verifyLink returns false for expired link
// - verifyLink returns false for tampered appointmentId
// - verifyLink returns false for tampered action
// - verifyLink returns false for tampered expires
// - verifyLink returns false for tampered sig
// - signLink throws if AUTH_SECRET is not set
// - buildConfirmUrl builds full URL with /confirm path
// - buildCancelUrl builds full URL with /cancel path
// - expiry defaults to scheduledAt + 24h
```

**Create `src/lib/appointments/appointment-links.ts`:**
```typescript
export function signLink(appointmentId: string, action: "confirm" | "cancel", scheduledAt: Date): { expires: number; sig: string }
export function verifyLink(appointmentId: string, action: "confirm" | "cancel", expires: number, sig: string): { valid: boolean; error?: string }
export function buildConfirmUrl(baseUrl: string, appointmentId: string, scheduledAt: Date): string
export function buildCancelUrl(baseUrl: string, appointmentId: string, scheduledAt: Date): string
```

### Phase 2: Update public API endpoints

**`src/app/api/public/appointments/lookup/route.ts`** — Rewrite:
- Accept `id`, `action`, `expires`, `sig` from query params
- Call `verifyLink(id, action, expires, sig)`
- If invalid → return error
- Fetch appointment by ID (with professional name, scheduledAt, modality)
- Check appointment status (return `alreadyConfirmed`/`alreadyCancelled` as today)

**`src/app/api/public/appointments/confirm/route.ts`** — Rewrite:
- Accept `{ id, expires, sig }` in POST body
- Call `verifyLink(id, "confirm", expires, sig)`
- If invalid → check if appointment already confirmed (preserve UX)
- Update appointment: `status: "CONFIRMADO"`, `confirmedAt: new Date()`

**`src/app/api/public/appointments/cancel/route.ts`** — Rewrite:
- Accept `{ id, expires, sig, reason? }` in POST body
- Call `verifyLink(id, "cancel", expires, sig)`
- If invalid → check if appointment already cancelled (preserve UX)
- Update appointment: `status: "CANCELADO_ACORDADO"`, `cancelledAt`, `cancellationReason`
- Create AuditLog entry (same as today)

### Phase 3: Update frontend pages

**`src/app/confirm/page.tsx`:**
- Parse `id`, `expires`, `sig` from `searchParams` instead of `token`
- Pass to lookup: `/api/public/appointments/lookup?id=...&action=confirm&expires=...&sig=...`
- Pass to confirm POST: `{ id, expires, sig }`

**`src/app/cancel/page.tsx`:**
- Same changes, with `action=cancel` and `reason` in POST body

### Phase 4: Update server-side link builders

Replace all `createAppointmentTokens`/`createBulkAppointmentTokens`/`regenerateAppointmentTokens` + `buildConfirmLink`/`buildCancelLink` calls with `buildConfirmUrl`/`buildCancelUrl`:

| File | Change |
|------|--------|
| `src/app/api/appointments/route.ts` | Remove `createBulkAppointmentTokens`, token fetching (lines 1202-1217). Replace `buildConfirmLink`/`buildCancelLink` with `buildConfirmUrl`/`buildCancelUrl` using first appointment's data |
| `src/app/api/appointments/[id]/route.ts` | Remove `regenerateAppointmentTokens` call (lines 260-264). Remove token fields from response (lines 292-300) |
| `src/app/api/appointments/[id]/resend-confirmation/route.ts` | Remove `regenerateAppointmentTokens` transaction. Just build URLs directly with `buildConfirmUrl`/`buildCancelUrl` |
| `src/app/api/jobs/send-reminders/route.ts` | Remove `createAppointmentTokens` call (lines 259-263). Build URLs with appointment data already available |
| `src/app/api/jobs/extend-recurrences/route.ts` | Remove `createBulkAppointmentTokens` call entirely (lines 177-179) — links built on-demand by reminder cron |
| `src/app/api/groups/[groupId]/sessions/route.ts` | Remove `createBulkAppointmentTokens` (2 places), remove token findMany queries (2 places). Build URLs from appointment data |

### Phase 5: Remove dead code

- **Delete** `src/lib/appointments/token-service.ts`
- **Delete** `src/app/api/appointments/confirm/route.ts` (legacy GET)
- **Delete** `src/app/api/appointments/cancel/route.ts` (legacy GET)
- **Update** `src/lib/appointments/index.ts` — remove all token-service exports, add appointment-links exports
- **Update** `src/app/api/appointments/recurrences/[id]/finalize/route.ts` — remove stale comment about "tokens cascade-delete" (line 141)

### Phase 6: Schema migration

**Update `prisma/schema.prisma`:**
- Remove `AppointmentToken` model (lines 467-483)
- Remove `tokens AppointmentToken[]` from `Appointment` model (line ~406)

**Run:** `npx prisma db push` (per project convention for schema drift)

### Phase 7: Verify

- `npm run test` — all tests pass
- `npm run build` — no dangling imports or type errors
- Manual smoke test: create appointment, check notification has valid signed URL, click confirm/cancel

## File Impact Summary

| File | Action |
|------|--------|
| `src/lib/appointments/appointment-links.ts` | **Create** |
| `src/lib/appointments/appointment-links.test.ts` | **Create** |
| `src/lib/appointments/token-service.ts` | **Delete** |
| `src/app/api/appointments/confirm/route.ts` | **Delete** |
| `src/app/api/appointments/cancel/route.ts` | **Delete** |
| `prisma/schema.prisma` | Edit (remove model + relation) |
| `src/lib/appointments/index.ts` | Edit (swap exports) |
| `src/app/api/public/appointments/lookup/route.ts` | Rewrite |
| `src/app/api/public/appointments/confirm/route.ts` | Rewrite |
| `src/app/api/public/appointments/cancel/route.ts` | Rewrite |
| `src/app/confirm/page.tsx` | Edit (URL params) |
| `src/app/cancel/page.tsx` | Edit (URL params) |
| `src/app/api/appointments/route.ts` | Edit (remove token creation) |
| `src/app/api/appointments/[id]/route.ts` | Edit (remove token regen) |
| `src/app/api/appointments/[id]/resend-confirmation/route.ts` | Edit (simplify) |
| `src/app/api/jobs/send-reminders/route.ts` | Edit (remove token creation) |
| `src/app/api/jobs/extend-recurrences/route.ts` | Edit (remove token creation) |
| `src/app/api/groups/[groupId]/sessions/route.ts` | Edit (remove token creation x2) |
| `src/app/api/appointments/recurrences/[id]/finalize/route.ts` | Edit (remove stale comment) |

**Total: 2 created, 3 deleted, 14 edited**

## References

- Brainstorm: `docs/brainstorms/2026-02-23-hmac-signed-appointment-links-brainstorm.md`
- Current token service: `src/lib/appointments/token-service.ts`
- Node.js crypto HMAC: `crypto.createHmac('sha256', secret).update(payload).digest('hex')`
