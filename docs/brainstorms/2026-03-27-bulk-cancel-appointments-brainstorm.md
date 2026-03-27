---
date: 2026-03-27
topic: bulk-cancel-appointments
---

# Bulk Cancel Appointments

## What We're Building

A feature to cancel multiple appointments at once for a date range, scoped by professional or clinic-wide. Covers use cases like holidays (cancel one day for the entire clinic) and vacations (cancel 15 days for a specific professional). Always cancels as `CANCELADO_PROFISSIONAL` since the clinic/professional is initiating.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cancel status | Always `CANCELADO_PROFISSIONAL` | Clinic/professional initiates, no charge to patient |
| Professional scope | Specific professional or all (admins); own-only for non-admins | Admins manage the clinic; professionals manage themselves |
| Appointment types | `CONSULTA` and `REUNIAO` only | Only types that involve patients / block time meaningfully |
| Patient notifications | No | Keep it simple; professional handles manually if needed |
| Cancellation reason | Required, single reason for all | Clear context for audit logs and patient-facing status |
| Date selection | Start + end date range (same date = single day) | One UI covers both "one day" and "two weeks" scenarios |
| Confirmation | Full summary with count by type + patient list | User sees exactly what they're about to cancel before confirming |

## UI Entry Points (3, same modal)

All three entry points open the **same reusable modal/dialog**, pre-filled differently:

1. **Daily agenda** — button in the header/toolbar to cancel the current day. Pre-fills start/end with that day.
2. **Weekly agenda** — action on a specific day column to cancel that day. Pre-fills start/end with the clicked day.
3. **Dedicated flow** — accessible from menu/settings, for longer periods (vacations). Empty date range for user to fill.

## UI Flow

1. User selects date range (start/end) — may be pre-filled from agenda context
2. User selects professional or "All professionals" (admins only; non-admins auto-scoped to self)
3. User enters reason (required)
4. System shows preview: appointment count, breakdown by type, list of affected patients
5. User confirms → bulk cancel executes
6. Success toast with count of cancelled appointments

## Backend

- Single new API endpoint for bulk cancel
- GET (or POST with `preview: true`): queries appointments by date range + professional + status (`AGENDADO`/`CONFIRMADO`) + type (`CONSULTA`/`REUNIAO`), returns preview (count, types, patients)
- POST: executes bulk cancel using `updateMany` in a `prisma.$transaction()`
- Audit log entry with all cancelled appointment IDs and reason
- Respects RBAC: non-admins can only cancel their own appointments

## Open Questions

- Where exactly in the menu/navigation should the dedicated flow (entry point 3) live?
- Should we handle recurrence deactivation when all future appointments of a recurrence are cancelled?

## Next Steps

-> `/ce:plan` for implementation details
