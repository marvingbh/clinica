---
date: 2026-03-16
topic: oneoff-group-sessions-and-past-date-scheduling
---

# One-off Group Sessions & Past Date Scheduling

## What We're Building

### 1. One-off Group Sessions from the Agenda

Professionals can create a group session directly from the appointment creation form by selecting multiple patients. No persistent TherapyGroup entity is needed — it's just a set of linked appointments.

- From the agenda, pick a date/time and select multiple patients
- When multiple patients are selected, it automatically becomes a group session
- Creates one Appointment per patient, all sharing the same `sessionGroupId` (new UUID field, no FK)
- Each patient billed at their individual `sessionFee` as `SESSAO_GRUPO`
- Shows as a single block on the calendar (like existing group sessions)
- No TherapyGroup, no recurrence, no member management

### 2. Past Date Scheduling (all appointment types)

Remove frontend date restrictions that prevent selecting past dates. Professionals need to retroactively register sessions that already happened but weren't logged. The backend already allows past dates.

## Why This Approach

- **No phantom entities**: Using a simple `sessionGroupId` UUID avoids creating fake TherapyGroup records just to link appointments
- **Reuses existing patterns**: Each appointment is a normal Appointment row — billing, status transitions, and calendar rendering all work as-is
- **Minimal schema change**: One new nullable column on Appointment
- **Clean separation**: Recurring groups (TherapyGroup + `groupId`) stay untouched; one-off groups use `sessionGroupId`

## Key Decisions

- **Linking mechanism**: New `sessionGroupId` (UUID, nullable, no FK) on Appointment — not reusing `groupId`/TherapyGroup
- **Billing**: Each patient's individual `sessionFee`, invoice item type `SESSAO_GRUPO`
- **UI entry point**: Agenda appointment creation form, multi-patient selection
- **Past dates**: Frontend-only change, remove date input restrictions globally (all appointment types)
- **No group entity**: One-off sessions don't create a TherapyGroup record

## Open Questions

- Calendar rendering: should one-off group sessions show patient count/names in the same style as recurring group blocks?
- Status transitions: should bulk status update work for one-off groups (update all linked appointments at once via `sessionGroupId`)?
- Notifications: should one-off group sessions send confirmation/reminder notifications to patients?

## Next Steps

-> `/ce:plan` for implementation details
