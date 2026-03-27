---
title: "feat: Bulk Cancel Appointments"
type: feat
status: active
date: 2026-03-27
origin: docs/brainstorms/2026-03-27-bulk-cancel-appointments-brainstorm.md
---

# Bulk Cancel Appointments

## Overview

Allow professionals/admins to cancel all appointments for a date range, scoped by professional or clinic-wide. Covers holidays (cancel one day for entire clinic) and vacations (cancel 15 days for a specific professional).

## Key Decisions (from brainstorm)

| Decision | Choice |
|----------|--------|
| Cancel status | Always `CANCELADO_PROFISSIONAL` |
| Professional scope | Specific professional or all (admins/`agenda_others: WRITE`); own-only otherwise |
| Appointment types | `CONSULTA` and `REUNIAO` only |
| Notifications | No patient notifications |
| Reason | Required (min 3 chars) |
| Date selection | Start + end date range (same date = single day) |
| Confirmation | Full preview: count by type + patient list |

## Design Decisions (from spec flow analysis)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Execute mode | Accept appointment IDs from preview | Prevents race condition between preview and confirm |
| Recurrence handling | Deactivate recurrence if all remaining appointments cancelled | Prevents `extend-recurrences` cron from regenerating |
| Group sessions | Include individually per-appointment | `CANCELADO_PROFISSIONAL` means professional cancels the whole context |
| Audit logs | Per-appointment entries | Healthcare compliance requires per-record traceability |
| Permission gating | `agenda_others >= WRITE` (not role-based) | Consistent with existing cancel and status routes |
| Max date range | 90 days server-side limit | Prevents runaway queries |
| Date boundaries | Use clinic timezone | Correct edge-of-day handling via clinic `timezone` field |
| Inverted date range | Auto-swap silently | Reduces friction |
| Empty preview | Show "No appointments found" message | Clear feedback |
| Bulk undo | Not in V1 | Individual reversal via existing status change UI |

## File Structure

```
src/lib/appointments/bulk-cancel.ts              # Pure domain functions
src/lib/appointments/bulk-cancel.test.ts          # Unit tests
src/app/api/appointments/bulk-cancel/route.ts     # API route (POST preview + execute)
src/app/agenda/components/BulkCancelDialog.tsx     # Reusable dialog component
src/app/agenda/services/appointmentService.ts      # Add bulkCancelPreview() + bulkCancelExecute()
```

## API Design

### `POST /api/appointments/bulk-cancel`

**Auth:** `withFeatureAuth({ feature: "agenda_own", minAccess: "WRITE" })`

**Request body:**

```typescript
// Preview mode
{
  mode: "preview"
  startDate: string    // YYYY-MM-DD
  endDate: string      // YYYY-MM-DD
  professionalProfileId?: string  // omit or "all" for clinic-wide (requires agenda_others: WRITE)
}

// Execute mode
{
  mode: "execute"
  appointmentIds: string[]  // IDs from preview response
  reason: string            // required, min 3 chars
}
```

**Preview response:**

```typescript
{
  appointments: Array<{
    id: string
    scheduledAt: string
    type: "CONSULTA" | "REUNIAO"
    status: string
    patient: { id: string, name: string } | null
    professionalName: string
  }>
  summary: {
    total: number
    byType: { CONSULTA: number, REUNIAO: number }
    patients: Array<{ id: string, name: string }>  // unique, sorted
  }
}
```

**Execute response:**

```typescript
{
  cancelledCount: number
  cancelledIds: string[]
}
```

## Domain Module: `src/lib/appointments/bulk-cancel.ts`

Pure functions to extract:

```typescript
// Filter appointments to only cancellable ones
filterCancellableAppointments(appointments) → filtered

// Build preview summary from appointments
buildBulkCancelSummary(appointments) → { total, byType, patients }

// Validate bulk cancel request
validateBulkCancelRequest({ startDate, endDate, reason? }) → { valid, error? }

// Check if user can cancel these appointments (ownership/permission)
canUserBulkCancel(user, professionalProfileId?) → boolean

// Find recurrences that should be deactivated
findRecurrencesToDeactivate(cancelledAppointmentIds, allRecurrenceAppointments) → recurrenceIds[]
```

## UI: `BulkCancelDialog.tsx`

Uses existing `Dialog` from `Sheet.tsx`. Two-step flow:

**Step 1 — Filters:**
- Date range: start + end date inputs (pre-filled from entry point context)
- Professional selector: dropdown with "All professionals" option (only if `agenda_others >= WRITE`)
- "Preview" button → fetches preview

**Step 2 — Confirm:**
- Summary: "X appointments will be cancelled"
- Breakdown by type (CONSULTA / REUNIAO count)
- Patient list (scrollable if many)
- Reason textarea (required)
- "Cancel appointments" button (red/destructive) + "Back" button

**Entry points (all open the same dialog with different pre-fills):**

1. **Daily agenda header** — button/icon in `AgendaHeader.tsx` toolbar → pre-fills start=end=selectedDate
2. **Weekly agenda** — action on day column in `WeeklyHeader.tsx` or day header → pre-fills start=end=clickedDate
3. **Dedicated flow** — TBD menu placement → empty date range

## Implementation Phases

### Phase 1: Domain + API (backend)

1. Create `src/lib/appointments/bulk-cancel.ts` with pure functions
2. Create `src/lib/appointments/bulk-cancel.test.ts` with unit tests
3. Create `src/app/api/appointments/bulk-cancel/route.ts` with preview + execute modes
4. Handle recurrence deactivation in the transaction

### Phase 2: Frontend

5. Create `src/app/agenda/components/BulkCancelDialog.tsx`
6. Add `bulkCancelPreview()` and `bulkCancelExecute()` to `appointmentService.ts`
7. Add entry point button to `AgendaHeader.tsx` (daily agenda)
8. Add entry point action to weekly agenda day columns
9. Refresh agenda data after successful bulk cancel

## Acceptance Criteria

- [ ] Admin can bulk-cancel a single day for all professionals
- [ ] Admin can bulk-cancel a date range for a specific professional
- [ ] Professional can bulk-cancel their own appointments for a date range
- [ ] Only CONSULTA and REUNIAO types with AGENDADO/CONFIRMADO status are affected
- [ ] Preview shows accurate count, type breakdown, and patient list
- [ ] Reason is required (min 3 chars)
- [ ] Per-appointment audit logs are created
- [ ] Recurrences are deactivated when all remaining appointments are cancelled
- [ ] Date range limited to 90 days max
- [ ] Dialog accessible from daily agenda, weekly agenda, and dedicated flow
- [ ] Non-admin users cannot cancel other professionals' appointments
- [ ] Success toast shows cancelled count
- [ ] Unit tests cover all pure domain functions

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-27-bulk-cancel-appointments-brainstorm.md](../brainstorms/2026-03-27-bulk-cancel-appointments-brainstorm.md)
- **Series cancel pattern:** `src/app/api/appointments/[id]/cancel/route.ts`
- **Group bulk status pattern:** `src/app/api/group-sessions/status/route.ts` + `src/lib/groups/bulk-status.ts`
- **Status transitions:** `src/lib/appointments/status-transitions.ts`
- **Dialog pattern:** `src/app/agenda/components/CancelConfirmDialog.tsx`
- **Auth pattern:** `src/lib/api/with-auth.ts` (`withFeatureAuth`)
