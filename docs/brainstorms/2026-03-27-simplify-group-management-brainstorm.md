---
date: 2026-03-27
topic: simplify-group-management
---

# Simplify Group Management — Move to Agenda

## What We're Building

Move group therapy management from the dedicated `/groups` page into the `/agenda` as the primary workflow. Users manage groups where they already work. The `/groups` page stays as a secondary/config view but is no longer the main entry point for day-to-day operations.

## Why This Approach

The current UX has 5 screens/modals, 3 session generation modes, and member management hidden inside edit mode. Users are confused by the number of screens and the disconnect between the agenda (where they manage sessions) and the groups page (where they manage membership). The agenda already shows group sessions and handles status management — extending it to handle membership and creation is the natural simplification.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary entry point | Agenda | Users already manage session status here; minimize context switching |
| `/groups` page | Stays as secondary/config, simplified | Redundancy for group creation and settings editing |
| Create recurring group | Extend existing "Group Session" creation in agenda to support recurrence | Reuse existing creation logic, just expose recurrence options in the UI |
| View/manage session status | No change — already works via GroupSessionSheet | Already the best UX in the system |
| Add/remove members | New section in GroupSessionSheet | Where users are when they realize they need to add/remove someone |
| Scope of member changes | "This session only" vs "This and all future" dialog | Mirrors existing recurrence edit pattern users already understand |
| Session generation | Automatic via cron; initial batch on group creation | Eliminates the confusing 3-mode generation panel |
| Backend logic | Reuse all existing APIs — no changes | Creation, generation, membership logic already works correctly |

## User Action Priority (from most to least frequent)

1. View/manage session status (confirm, mark attended) — already in agenda
2. Add/remove members — **moving to agenda**
3. Generate sessions — automated via cron
4. Edit group settings (day, time, professional) — stays in `/groups` or link from agenda

## New Flow from Agenda

1. **Create recurring group**: FAB menu → "Group Session" → add recurrence options (weekly/biweekly/monthly + end type). Uses existing `POST /api/groups` + `POST /api/groups/{id}/sessions`.
2. **View/manage session status**: Click group session card → GroupSessionSheet (no change).
3. **Add/remove members**: Inside GroupSessionSheet, a "Members" section with:
   - Patient search to add
   - Remove button per member
   - Scope dialog: "This session only" / "This and all future sessions"
4. **Edit group settings**: Link from GroupSessionSheet to `/groups` edit page (infrequent action).

## What Changes

- Extend `CreateGroupSessionSheet` to support recurrence options
- Add member management section to `GroupSessionSheet`
- Add scope choice dialog for member add/remove
- Simplify `/groups` page (remove sessions tab, session generation panel)

## What Does NOT Change

- Backend group creation logic
- Session generation logic (calculateGroupSessionDates, POST /api/groups/{id}/sessions)
- Recurrence extension cron job
- Group membership data model
- GroupSessionSheet status management (already works)

## Open Questions

- Should the `/groups` page member management be removed entirely or kept as redundant?
- Should "Edit group settings" be a link to `/groups` or an inline form in the agenda?

## Next Steps

→ `/ce:plan` for implementation details
