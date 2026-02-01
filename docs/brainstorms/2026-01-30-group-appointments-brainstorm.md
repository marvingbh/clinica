# Group Appointments Feature Brainstorm

**Date:** 2026-01-30
**Status:** Ready for planning

## What We're Building

A group therapy/session management feature that allows:

1. **Named Persistent Groups** - Groups like "Thursday Anxiety Support Group" with a fixed schedule
2. **Flexible Recurrence** - Weekly, biweekly, or monthly patterns per group
3. **Member Management** - Patients join from a start date and stay until explicitly removed
4. **Guest Support** - Add non-members to individual sessions (tracked separately)
5. **Individual Status Tracking** - Confirm/cancel/no-show per participant per session
6. **Calendar Display** - Single block showing group name + participant count, expandable to see details
7. **Notifications** - Standard reminders/confirmations sent to each participant

## Why This Approach

**Chosen: Approach A - Group Entity Model**

We're creating separate tables for groups rather than extending the existing Appointment model because:

1. **Conceptual clarity** - Groups are fundamentally different from 1:1 appointments
2. **Clean data model** - Easy to query members vs guests, active vs inactive
3. **Independent status** - Each participant has their own status without affecting others
4. **No regression risk** - Existing individual appointments remain unchanged
5. **Future flexibility** - Can add group-specific features without impacting appointments

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Group structure | Named persistent entity | Groups have identity, patients join/leave over time |
| Recurrence | Flexible per group | Different groups can have different schedules |
| Capacity limits | None required | No max capacity needed for now |
| Join behavior | Auto-schedule indefinitely | Patients scheduled from join date until removed |
| Guest handling | Separate guest list | Clear distinction between members and one-time guests |
| Calendar display | Single block + count | Click to expand and see all participants |
| Notifications | Same as individual | Reminders sent to each participant |
| Session duration | 1h30min default | Can be customized per group |

## Data Model Design

### New Tables

```
TherapyGroup
├── id
├── clinicId
├── professionalProfileId
├── name (e.g., "Thursday Anxiety Group")
├── description (optional)
├── dayOfWeek (0-6)
├── startTime (e.g., "14:00")
├── duration (default 90 minutes)
├── recurrenceType (WEEKLY, BIWEEKLY, MONTHLY)
├── isActive
├── createdAt
└── updatedAt

GroupMembership
├── id
├── groupId
├── patientId
├── joinDate
├── leaveDate (nullable - null means active)
├── createdAt
└── updatedAt

GroupSession
├── id
├── groupId
├── scheduledAt
├── endAt
├── status (SCHEDULED, COMPLETED, CANCELLED)
├── notes (optional)
├── createdAt
└── updatedAt

GroupSessionParticipant (for members)
├── id
├── sessionId
├── patientId
├── membershipId (links to GroupMembership)
├── status (AGENDADO, CONFIRMADO, FINALIZADO, NAO_COMPARECEU, CANCELADO)
├── confirmToken
├── cancelToken
├── confirmedAt
├── cancelledAt
├── cancellationReason
├── createdAt
└── updatedAt

GroupSessionGuest (for non-members)
├── id
├── sessionId
├── patientId
├── status (same as above)
├── confirmToken
├── cancelToken
├── confirmedAt
├── cancelledAt
├── cancellationReason
├── notes (why they joined as guest)
├── createdAt
└── updatedAt
```

## User Flows

### Creating a Group
1. Admin/Professional creates group with name, schedule, recurrence
2. System creates the TherapyGroup record
3. Sessions are generated automatically (similar to appointment recurrence)

### Adding a Patient to Group
1. Select patient, set join date
2. System creates GroupMembership record
3. System creates GroupSessionParticipant records for all future sessions from join date

### Removing a Patient from Group
1. Set leave date on membership
2. Future sessions no longer include this patient
3. Past sessions retain their records

### Adding a Guest to a Session
1. Select specific session
2. Add patient as guest
3. System creates GroupSessionGuest record
4. Guest receives notifications for that session only

### Managing Session Attendance
1. View session participants (members + guests)
2. Update individual status: confirm, no-show, cancel
3. Each participant's status is independent

### Viewing on Calendar
1. Group session shows as single block: "Thursday Anxiety Group (5)"
2. Click expands to show:
   - All member participants with status
   - All guest participants with status
   - Options to add guest, manage attendance

## Open Questions

1. **Billing** - Should group sessions have pricing? Per participant or per session?
2. **History** - When viewing a patient's history, should group sessions appear alongside individual appointments?
3. **Conflict checking** - Should group sessions block individual appointments at the same time for the professional?

## Next Steps

Run `/workflows:plan` to create implementation plan with:
- Database migrations
- API endpoints
- UI components for group management
- Calendar integration
