---
title: "feat: Simplify Group Management — Move to Agenda"
type: feat
status: active
date: 2026-03-27
origin: docs/brainstorms/2026-03-27-simplify-group-management-brainstorm.md
---

# Simplify Group Management — Move to Agenda

## Overview

Move group therapy management from the dedicated `/groups` page into `/agenda` as the primary workflow. Users manage groups where they already work — the agenda. The `/groups` page stays as a secondary config view.

## Problem Statement

The current group management UX has 5 screens/modals, 3 session generation modes, and member management hidden inside edit mode. Users are confused by the disconnect between the agenda (where they manage session status) and the groups page (where they manage membership). The most frequent action (session status management) already lives in the agenda — the rest should follow. (see brainstorm)

## Proposed Solution

Three changes, in priority order:

### Change 1: Member Management in GroupSessionSheet

Add an "Add/Remove Members" section to the existing `GroupSessionSheet` (agenda). When the user adds or removes a member, a scope dialog asks "This session only" or "This and all future sessions" — mirroring the existing recurrence edit pattern.

### Change 2: Recurring Group Creation from Agenda

Extend `CreateGroupSessionSheet` to support recurrence options (WEEKLY/BIWEEKLY/MONTHLY). When recurrence is selected, the flow creates a `TherapyGroup` + adds members + generates initial sessions — all reusing existing APIs.

### Change 3: Simplify /groups Page

Remove the sessions tab and session generation panel. Keep it as a settings page for group CRUD and as a redundant entry for member management.

## Technical Approach

### Design Decisions (from brainstorm + spec flow analysis)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| "This session only" — add | Create appointment with `groupId` set | Keeps the appointment in the group session |
| "This session only" — remove | Cancel (`CANCELADO_PROFISSIONAL`) | Preserves audit trail and billing history |
| "All future" — add | `POST /api/groups/{id}/members` + regenerate | Uses existing membership + session sync |
| "All future" — remove | `PATCH /api/groups/{id}/members/{memberId}` with leaveDate | Uses existing removal API which deletes future appointments |
| joinDate for "all future" add | Session's date | User intent: "add starting from this session" |
| Ad-hoc sessions | Hide member management | No `TherapyGroup` entity, no membership concept |
| Recurring creation — end type | Only INDEFINITE (cron extends) | `TherapyGroup` model has no endDate/occurrences fields; avoids schema change |
| Initial session generation | Automatic after group creation (6 months) | Users shouldn't wait for weekly cron |
| "This session only" + regeneration | Regeneration skips appointments not in membership | One-off additions are intentionally ephemeral |

### API Calls (all existing — no backend changes)

**Add member to "this session only":**
```
POST /api/appointments
  { patientId, date, startTime, duration, professionalProfileId, groupId }
```
Note: The existing appointment creation endpoint accepts `groupId` when passed directly. The appointment appears in the group session.

**Add member to "all future":**
```
POST /api/groups/{groupId}/members
  { patientId, joinDate: sessionDate }
POST /api/groups/{groupId}/sessions
  { mode: "regenerate" }
```

**Remove member from "this session only":**
```
DELETE /api/appointments/{appointmentId}
```

**Remove member from "all future":**
```
PATCH /api/groups/{groupId}/members/{memberId}
  { leaveDate: sessionDate }
```
(This already deletes all future appointments via the existing API.)

**Create recurring group from agenda:**
```
1. POST /api/groups  (create TherapyGroup)
2. POST /api/groups/{id}/members  (×N, one per patient)
3. POST /api/groups/{id}/sessions  (mode: "generate", startDate, endDate)
```
Frontend orchestrates these sequentially. If step 2 or 3 fails, the group still exists — user can retry from `/groups`.

### Component Decomposition

`GroupSessionSheet.tsx` is 671 lines and will grow with member management. Extract before adding:

```
src/app/agenda/components/
├── GroupSessionSheet.tsx          (~120 lines, orchestrator)
├── group-session/
│   ├── GroupSessionHeader.tsx     (~80 lines, date/time/professional info)
│   ├── GroupBulkActions.tsx       (~60 lines, bulk status buttons)
│   ├── GroupParticipantList.tsx   (~120 lines, per-participant status actions)
│   ├── GroupMemberActions.tsx     (~100 lines, add/remove with patient search)
│   ├── GroupProfessionalEdit.tsx  (~80 lines, additional professionals checkboxes)
│   └── MemberScopeDialog.tsx     (~50 lines, "this one" / "all future" dialog)
```

`CreateGroupSessionSheet.tsx` gets a conditional recurrence section (~30 lines added). The recurrence options are already available in `RecurrenceOptions.tsx`.

### /groups Page Simplification

**Remove:**
- Sessions tab (lines 719-737 in `page.tsx`)
- Session generation panel (`SessionGenerationPanel.tsx`)
- `SessionCard.tsx` component
- Session-related state variables (~8 variables)

**Keep:**
- Group list with cards
- Create/edit group form
- Member management (Members tab)
- Add "Ver na Agenda" link on each group card

**Add:**
- "Ver na Agenda" button on each group card → navigates to agenda on the group's day

## Implementation Phases

### Phase 1: Extract GroupSessionSheet sub-components

Split the existing 671-line `GroupSessionSheet.tsx` into focused components. No new features — purely structural.

**Files:**
- Extract `GroupSessionHeader.tsx`
- Extract `GroupBulkActions.tsx`
- Extract `GroupParticipantList.tsx`
- Extract `GroupProfessionalEdit.tsx`
- Slim down `GroupSessionSheet.tsx` to orchestrator

**Success criteria:** All existing group session features work identically. No visual changes.

### Phase 2: Add member management to GroupSessionSheet

Add the new `GroupMemberActions.tsx` and `MemberScopeDialog.tsx` components. Wire them into the orchestrator.

**Files:**
- Create `GroupMemberActions.tsx` (patient search + add/remove)
- Create `MemberScopeDialog.tsx` (scope choice dialog)
- Update `GroupSessionSheet.tsx` to render member actions (only for recurring groups where `groupId` exists)
- Add service functions to `appointmentService.ts` for the member management API calls

**Success criteria:** Users can add/remove members from the agenda with scope choice. Both "this one" and "all future" work correctly.

### Phase 3: Extend CreateGroupSessionSheet for recurrence

Add recurrence options to the ad-hoc group session creation sheet so users can create recurring groups directly from the agenda.

**Files:**
- Update `CreateGroupSessionSheet.tsx` — add recurrence toggle and options
- Add service functions for group creation + member addition + session generation
- Wire the sequential API call flow with error handling

**Success criteria:** Users can create a recurring group from the agenda FAB menu. Sessions appear in the agenda immediately.

### Phase 4: Simplify /groups page

Remove session-related UI and state. Add "Ver na Agenda" navigation.

**Files:**
- Simplify `src/app/groups/page.tsx` (remove ~200 lines of session state/UI)
- Remove `SessionGenerationPanel.tsx`
- Remove `SessionCard.tsx`
- Update `GroupCard` or group list to add agenda navigation link

**Success criteria:** Groups page is simpler. Session management only happens in the agenda.

## Acceptance Criteria

### Phase 1 (extraction)
- [ ] `GroupSessionSheet.tsx` is under 150 lines
- [ ] All extracted components are under 150 lines each
- [ ] Existing group session functionality unchanged (status management, bulk actions, rescheduling, professional editing)
- [ ] Build passes, no visual regressions

### Phase 2 (member management in agenda)
- [ ] "Add member" button visible in GroupSessionSheet for recurring group sessions
- [ ] "Add member" button hidden for ad-hoc sessions (no groupId)
- [ ] Patient search works inside the sheet
- [ ] Scope dialog appears for add/remove: "This session only" / "This and all future"
- [ ] "This session only" — add: creates appointment in the session
- [ ] "This session only" — remove: cancels the appointment
- [ ] "All future" — add: creates GroupMembership + regenerates sessions
- [ ] "All future" — remove: sets leaveDate + deletes future appointments
- [ ] Participant list refreshes after add/remove
- [ ] Works for ADMIN and PROFESSIONAL roles (respecting agenda_own/agenda_others permissions)

### Phase 3 (recurring creation from agenda)
- [ ] FAB menu "Group Session" creation sheet shows recurrence toggle
- [ ] When recurrence enabled: shows name, recurrence type (WEEKLY/BIWEEKLY/MONTHLY)
- [ ] dayOfWeek derived from selected date
- [ ] Creation flow: creates TherapyGroup → adds members → generates sessions (6 months for INDEFINITE)
- [ ] Sessions appear in agenda immediately after creation
- [ ] Error handling: if session generation fails, group still exists (user can retry)

### Phase 4 (/groups simplification)
- [ ] Sessions tab removed from group detail view
- [ ] Session generation panel removed
- [ ] "Ver na Agenda" link on each group card
- [ ] Group creation, editing, and member management still work
- [ ] Page file is significantly shorter

## Dependencies & Risks

**Risks:**
- Phase 1 (extraction) is the foundation — if the extraction breaks existing behavior, all phases are blocked
- "This session only" additions are ephemeral — regeneration from `/groups` will remove them. This is intentional but may confuse power users. Consider a toast warning.
- The 7-API-call creation flow (Phase 3) has no transaction guarantee. Partial failures are possible but recoverable from `/groups`.

**Dependencies:**
- Phase 2 depends on Phase 1 (extraction)
- Phase 3 is independent of Phase 2
- Phase 4 depends on Phase 2 and 3 being complete

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-27-simplify-group-management-brainstorm.md](../brainstorms/2026-03-27-simplify-group-management-brainstorm.md) — Key decisions: agenda as primary, scope dialog for member changes, backend unchanged
- **Group architecture:** `docs/plans/2026-01-30-feat-group-appointments-plan.md`
- **One-off groups:** `docs/plans/2026-03-16-001-feat-oneoff-group-sessions-past-dates-plan.md`
- **Bulk status pattern:** `docs/plans/2026-03-06-group-bulk-status-plan.md`
- **Existing components:** `src/app/agenda/components/GroupSessionSheet.tsx`, `CreateGroupSessionSheet.tsx`
- **Existing APIs:** `src/app/api/groups/` (CRUD + members + sessions)
- **Domain logic:** `src/lib/groups/session-generator.ts`
