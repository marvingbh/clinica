# Group Session Bulk Status Actions

## Problem

Group sessions require clicking each participant individually to change status. No way to confirm/finalize/cancel an entire session at once. The group session has no visible overall status — only individual participant statuses.

## Design Decisions

- **Bulk actions override all participants**, including those already in terminal states (for corrections)
- **Confirmation dialog** before executing bulk actions
- **Buttons always visible** in header area
- **Derived group status** — no new DB field. Status is derived from participants:
  - All same status → show single badge
  - Mixed → show per-status count badges (current behavior)
- **New API endpoint** — single transaction for atomicity

## API

### `PATCH /api/group-sessions/status`

- Auth: `withFeatureAuth({ feature: "agenda_own", minAccess: "WRITE" })`
- Body: `{ groupId: string, scheduledAt: string, status: AppointmentStatus }`
- Single Prisma transaction:
  1. Find all appointments with matching `groupId` + `scheduledAt` date + `clinicId`
  2. For each appointment: update status, set timestamps (`confirmedAt`/`cancelledAt`), create audit log
  3. Handle CANCELADO_ACORDADO → create session credits
  4. Handle FINALIZADO → update patient `lastVisitAt`
- Returns: `{ success: true, updatedCount: number }`

## Frontend

### Service

Add `updateGroupSessionStatus(groupId, scheduledAt, status)` to `appointmentService.ts`.

### GroupSessionSheet UI

Header area (purple section), after status summary:

```
┌─────────────────────────────┐
│ 👥 Sessão em Grupo          │
│ segunda, 10 de março, 2026  │
│ 🕐 10:00 - 11:00            │
│ Dra. Maria                  │
│ ● Agendado (derived badge)  │
│                             │
│ [Confirmar Todos]           │
│ [Todos Compareceram]        │
│ [Desmarcou] [Faltou] [S/C]  │
├─────────────────────────────┤
│ PARTICIPANTES (3)           │
│ ─── João ───────── Agendado │
│  (individual buttons)       │
│ ─── Maria ──────── Agendado │
│  (individual buttons)       │
└─────────────────────────────┘
```

- Confirmation dialog: `window.confirm("Marcar todos como [status]?")`
- Loading state: all bulk buttons disabled while updating
- After success: `onStatusUpdated()` triggers agenda refetch

### Agenda Visual Feedback

Already implemented:
- Group blocks get `opacity-50/60` when all participants FINALIZADO
- Individual FINALIZADO appointments get reduced opacity across all views (daily, weekly, overview)
