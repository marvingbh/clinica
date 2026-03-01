# Replace AppointmentToken Table with HMAC-Signed URLs

**Date**: 2026-02-23
**Status**: Approved

## What We're Building

Replace the `AppointmentToken` database table with stateless HMAC-signed URLs for patient confirm/cancel links. This eliminates a growing table (2 rows per appointment, no cleanup), removes DB lookups on patient clicks, and simplifies token creation/regeneration logic across ~15 files.

## Why This Approach

The current system stores random tokens in a DB table, requiring writes on appointment creation, reads on patient clicks, updates on use, and regeneration on reschedule. An HMAC signature encodes the same information (appointment ID, action, expiry) into the URL itself — the server verifies by re-computing the signature, with zero DB overhead.

## Key Decisions

1. **Expiry**: Keep 24h after appointment time (same as today)
2. **Single-use**: No — idempotent is fine. Clicking confirm twice is a no-op since appointment status is already CONFIRMADO
3. **Legacy GET routes**: Remove `/api/appointments/confirm` and `/api/appointments/cancel` (GET). Keep only `/api/public/` POST endpoints
4. **HMAC secret**: Reuse `AUTH_SECRET` env var (already exists, sufficient strength)
5. **URL format**: `/confirm?id={appointmentId}&action=confirm&expires={timestamp}&sig={hmac}` (same for cancel)

## What Changes

### Remove
- `AppointmentToken` model from schema.prisma
- `token-service.ts` (~200 lines)
- Legacy GET confirm/cancel routes
- All `createAppointmentTokens`, `createBulkAppointmentTokens`, `regenerateAppointmentTokens` calls
- DB migration to drop the table

### Add
- `appointment-links.ts` (~50 lines): `signLink(appointmentId, action, expiresAt)` and `verifyLink(id, action, expires, sig)`
- Updated public confirm/cancel/lookup endpoints to verify HMAC instead of DB lookup

### Simplify
- Appointment creation: no more bulk token inserts
- Appointment reschedule: no more token regeneration (new link is just re-signed with new expiry)
- Resend confirmation: just re-build the signed URL, no DB transaction needed
- Reminder job: no token creation fallback needed

## Open Questions

None — all decisions resolved.
