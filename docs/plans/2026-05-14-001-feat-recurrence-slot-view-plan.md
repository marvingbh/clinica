---
title: Visão de Slots por Recorrência
type: feat
status: completed
date: 2026-05-14
origin: docs/brainstorms/2026-05-14-recurrence-slot-view-brainstorm.md
---

# feat: Visão de Slots por Recorrência

## Overview

Add a third agenda view (alongside daily and weekly) that renders **only** recurring appointments (`WEEKLY`, `BIWEEKLY`, `MONTHLY`) on a weekday × hour grid. The view is a *steady-state template* of the week — it does not vary by calendar week — so the operator can spot at a glance where there's room to place a new recurring patient. Biweekly slots can be shared between a par and an ímpar patient; the view surfaces "Vaga (par/ímpar)" hints for pair-completable slots. Monthly recurrences are tagged with the week-of-month they occupy.

## Problem Statement

The current weekly view mixes one-off and recurring appointments. When the operator needs to find a free weekly slot for a new patient, ad-hoc appointments visually clutter the grid and make it hard to identify cells that are *structurally* free week after week. The operator has to mentally subtract every transient appointment to see the steady recurrence pattern. The brainstorm captured the gap and the chosen visual model.

## Proposed Solution

A new client-rendered page at `/agenda/recorrencias` that:

1. Pulls active `AppointmentRecurrence` rows for the clinic (filtered by selected professional, with `agenda_others` permission gating "Todos" mode).
2. Renders a fixed weekday × hour grid using the same time-grid math as the weekly view (`WEEKLY_GRID` in `agenda/lib/grid-config.ts`).
3. Each occupied cell shows: patient name + `S`/`Q`/`M` frequency badge + a color tied to the recurrence frequency (or to the professional, in "Todos" mode).
4. `BIWEEKLY` cells split horizontally into a *par* half and an *ímpar* half; either half can be empty, in which case it shows `Vaga (par)` / `Vaga (ímpar)`.
5. `MONTHLY` cells stack at the bottom of their weekday's slot with a `Xª seg/ter/...` badge (week-of-month plus weekday) — they don't block the whole slot since they only occupy one week per month.
6. Reuses the existing professional selector pattern (`AgendaContext.selectedProfessionalId` + the pill row).

## Technical Approach

### Architecture

```
Page (client component)
  └─ useRecurrenceData (hook)
       └─ GET /api/appointments/recurrences/slots
              └─ prisma.appointmentRecurrence.findMany + patient + professional + additionalProfessionals
       └─ groupRecurrencesIntoSlots()  // pure
       └─ getBiweeklyParity()           // pure
       └─ getWeekOfMonth()              // pure
  └─ RecurrenceHeader (prof selector + view nav)
  └─ RecurrenceGrid (weekday × hour layout)
       └─ RecurrenceSlot (one cell: badge, name, par/ímpar split, monthly badges)
```

No new database tables, no migration. Pure read view.

### Data Model

No schema changes. Existing `AppointmentRecurrence` provides everything (`prisma/schema.prisma:633-668`):

- `recurrenceType: "WEEKLY" | "BIWEEKLY" | "MONTHLY"`
- `dayOfWeek: 0..6` (0=Sunday)
- `startTime: "HH:mm"`, `endTime: "HH:mm"`, `duration: minutes`
- `startDate: date` (anchors par/ímpar parity for BIWEEKLY, and week-of-month for MONTHLY)
- `endDate: date | null` (filter out past)
- `isActive: boolean`
- `patientId`, `professionalProfileId`, plus `additionalProfessionals` (m:n via `RecurrenceProfessional`)

### Implementation Phases

#### Phase 1 — Pure helpers + tests [x]

**New module** `src/lib/appointments/recurrence-slots.ts`:

- `getBiweeklyParity(startDate: Date | string): "par" | "ímpar"` — ISO-week parity of `startDate`. `par` = even ISO week, `ímpar` = odd.
- `getWeekOfMonth(date: Date | string): 1 | 2 | 3 | 4 | 5` — `Math.ceil(day / 7)` of `date.getDate()`.
- `formatFrequencyTag(type: RecurrenceType): "S" | "Q" | "M"`
- `groupRecurrencesIntoSlots(rows: RecurrenceForSlot[]): SlotGroup[]` — buckets rows by `(dayOfWeek, startTime, endTime)` so the grid can render one cell per (weekday × time-range) with potentially multiple recurrences inside (per-prof in "Todos", or one weekly + monthly stack).
- `pairBiweekly(rows: RecurrenceForSlot[]): { par: RecurrenceForSlot | null; impar: RecurrenceForSlot | null }` — within a slot's biweekly rows, returns the matched pair (one of each parity, or one + null).

**Test file** `src/lib/appointments/recurrence-slots.test.ts` covering:
- Parity: startDate on ISO week 20 → "par"; week 21 → "ímpar"; year-boundary edge case (week 53 → odd).
- Week-of-month: 1st → 1, 7th → 1, 8th → 2, 28th → 4, 29th → 5.
- Grouping merges by `(dayOfWeek, startTime, endTime)` even when professional differs.
- Pairing returns both halves when present, leaves the missing parity null when one is absent, and is stable when two biweeklies share the same parity (returns the older `startDate` first and surfaces a conflict flag for the planner — log only, not blocking).

#### Phase 2 — API endpoint + tests [x]

**New route** `src/app/api/appointments/recurrences/slots/route.ts`:

```typescript
// GET /api/appointments/recurrences/slots?professionalProfileId=<id>
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }) => {
    const sp = new URL(req.url).searchParams
    const profParam = sp.get("professionalProfileId")
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const profFilter = profParam ?? (canSeeOthers ? null : user.professionalProfileId)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const rows = await prisma.appointmentRecurrence.findMany({
      where: {
        clinicId: user.clinicId,
        isActive: true,
        recurrenceType: { in: ["WEEKLY", "BIWEEKLY", "MONTHLY"] },
        type: { in: ["CONSULTA", "REUNIAO", "TAREFA"] }, // skip NOTA/LEMBRETE (chips, non-blocking)
        OR: [{ endDate: null }, { endDate: { gte: today } }],
        ...(profFilter
          ? {
              OR: [
                { professionalProfileId: profFilter },
                { additionalProfessionals: { some: { professionalProfileId: profFilter } } },
              ],
            }
          : {}),
      },
      select: {
        id: true, type: true, title: true,
        recurrenceType: true, dayOfWeek: true,
        startTime: true, endTime: true, duration: true,
        startDate: true, endDate: true,
        professionalProfileId: true,
        professionalProfile: { select: { user: { select: { name: true } } } },
        patientId: true,
        patient: { select: { id: true, name: true } },
        additionalProfessionals: {
          select: { professionalProfileId: true, professionalProfile: { select: { user: { select: { name: true } } } } },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    })
    return NextResponse.json({ recurrences: rows })
  }
)
```

**Test file** `src/app/api/appointments/recurrences/slots/route.test.ts` mocking Prisma:
- ADMIN with `agenda_others=READ` and no `professionalProfileId` → fetches all clinic recurrences
- PROFESSIONAL with `agenda_others=NONE` → forced to own ID even without param
- Filter param respected when provided
- `endDate < today` excluded; null endDate kept
- `additionalProfessionals` is OR'd into the professional filter
- `recurrenceType: WEEKLY/BIWEEKLY/MONTHLY` only; `INDEFINITE` doesn't exist as a type but verify `type` filter excludes `NOTA`/`LEMBRETE`

#### Phase 3 — Grid + slot components [x]

**New components** under `src/app/agenda/recorrencias/components/`:

- `RecurrenceGrid.tsx` — weekday columns × hour rows. Reuses:
  - `dayGridTemplate(days)` from `agenda/lib/utils.ts:248-280`
  - `WEEKLY_GRID` config from `agenda/lib/grid-config.ts`
  - `computeHourRange()` from `agenda/lib/hour-range.ts` (passing slot start/end times from recurrences)
  - `minutesToPixel` / `formatTimeFromMinutes` from `agenda/lib/grid-geometry.ts`

  Does NOT reuse `WeeklyGrid.tsx` — that component is coupled to Appointment/GroupSession/DnD. Recurrence grid is a fresh, simpler component (~150 lines target).

- `RecurrenceSlot.tsx` — one weekday × time-range cell. Variants:
  - **Single weekly**: full-width name + `S` badge + frequency-tinted background
  - **Biweekly pair**: two horizontal halves, par on top (or left), ímpar below. Each half shows name + `Q` badge or "Vaga (par)" / "Vaga (ímpar)".
  - **Monthly stack**: smaller cell at the bottom edge with name + `M` badge + "Xª <weekday>" text (e.g. "2ª qua").
  - **"Todos" mode**: instead of frequency tint, the per-professional palette from `agenda/lib/professional-colors.ts` colors the cell. Multiple pros on same slot stack as sub-cards.

- `RecurrenceHeader.tsx` — page header. Reuses the same prof-selector pill row from `AgendaHeader.tsx` (extract or copy — see Risks). Reads/writes `AgendaContext.selectedProfessionalId`.

**New hook** `src/app/agenda/recorrencias/hooks/useRecurrenceData.ts`:
- Fetches `/api/appointments/recurrences/slots?professionalProfileId=...`
- Caches per-prof (simple in-state cache; refetch on prof change)
- Returns `{ recurrences, slotGroups, hourRange, isLoading, error }`

#### Phase 4 — Page + nav links [x]

- New page `src/app/agenda/recorrencias/page.tsx` (client component, uses `useAgendaContext` + `useRecurrenceData`).
- Add "Recorrências" link to:
  - `src/app/agenda/components/AgendaHeader.tsx` (next to the existing "Semana" link)
  - `src/app/agenda/weekly/components/WeeklyHeader.tsx` (symmetric)
  - The new page's own header (links back to daily/weekly)
- Empty state when no recurrences match the current filter: "Nenhuma recorrência ativa para [professional name]".
- Legend at the bottom or in a tooltip: `S = Semanal, Q = Quinzenal, M = Mensal`.

### Visual Spec

```
┌─────────────────────────────────────────────────────────────┐
│  Recorrências                [Todos] [Ana] [Carlos] [João]  │
│  Dia | Semana | RECORRÊNCIAS                                │
├─────────────────────────────────────────────────────────────┤
│       │ Seg     │ Ter     │ Qua     │ Qui     │ Sex        │
├──────┼─────────┼─────────┼─────────┼─────────┼─────────────┤
│ 08:00 │ Maria S │         │         │         │ João Q par  │
│       │ Pedro Q │         │         │         │ Vaga ímpar  │
│       │  ímpar  │         │         │         │             │
├──────┼─────────┼─────────┼─────────┼─────────┼─────────────┤
│ 09:00 │         │ Lucas S │         │ Reunião │             │
│       │         │         │         │ M 2ª qui│             │
└──────┴─────────┴─────────┴─────────┴─────────┴─────────────┘
   Legenda: S Semanal · Q Quinzenal · M Mensal
```

(Monospaced sketch — actual rendering uses badges & colors.)

## System-Wide Impact

### Interaction Graph

- New endpoint `/api/appointments/recurrences/slots` triggers `prisma.appointmentRecurrence.findMany` + nested includes. No callbacks, no side effects (pure read).
- `AgendaContext.selectedProfessionalId` is shared with daily/weekly views — switching pro in any view updates the others via sessionStorage. The new view subscribes to the same context.
- Adding nav links to `AgendaHeader.tsx` / `WeeklyHeader.tsx` doesn't alter existing flows — purely additive.
- `agenda_own` + `agenda_others` permission pair already governs the access pattern; the new endpoint follows the same pattern.

### Error & Failure Propagation

- API errors return `{ error: "..." }` with appropriate status. Frontend `useRecurrenceData` exposes `error` state; page renders an error banner without crashing.
- Bad/missing professional ID → endpoint silently filters to empty result (no 400, since it's a query param).
- A recurrence with a `dayOfWeek` outside 0..6 or malformed `startTime` is logged-and-skipped on the client (defensive), not surfaced to the user.

### State Lifecycle Risks

None — the feature is stateless and read-only.

### API Surface Parity

- This is a new surface. There is no agent/tool equivalent yet (the codebase isn't agent-native), so no parity check needed beyond the page itself.

### Integration Test Scenarios

1. **Biweekly pair completion**: one biweekly patient on Mon 8am with `startDate` in ISO week 20 (par) → cell shows par on top, `Vaga (ímpar)` on bottom.
2. **Cross-prof biweekly pair**: same slot, prof A has par, prof B has ímpar — in "Todos" mode the cell shows both. In single-prof mode, only the selected prof's half is shown.
3. **Monthly + Weekly at same slot**: shows the weekly cell as primary; monthly badge stacks at the bottom with the `Xª qua` indicator.
4. **Recurrence with `additionalProfessionals`**: filtering by an additional professional includes that recurrence (via the OR clause).
5. **`endDate` past**: recurrence is excluded entirely from the response.

## Acceptance Criteria

### Functional

- [ ] Page accessible at `/agenda/recorrencias` for users with `agenda_own.READ`.
- [ ] Nav link added to `AgendaHeader.tsx` and `WeeklyHeader.tsx` ("Recorrências" button, same style as the existing "Semana"/"Dia" link).
- [ ] Grid renders weekday columns × hour rows; hour range auto-fits the recurrences (via `computeHourRange`).
- [ ] Weekly recurrences render full-cell with name + `S` badge.
- [ ] Biweekly recurrences render as a half-cell with name + `Q` badge + parity tag. When the parity pair is empty, the other half shows `Vaga (par)` or `Vaga (ímpar)`.
- [ ] Monthly recurrences render with name + `M` badge + `Xª <weekday>` text. They stack at the bottom of the weekday-time cell without blocking the whole slot.
- [ ] "Todos" mode color-codes by professional (using `professional-colors.ts`). Single-prof mode colors by frequency type.
- [ ] Professional selector reuses `AgendaContext` and persists across views.
- [ ] `agenda_others.READ` permission required to view another professional's recurrences.
- [ ] Empty state when no recurrences match.
- [ ] Legend explains `S/Q/M` tags.

### Non-Functional

- [ ] Single Prisma query per page load; no N+1 (verified by checking included relations).
- [ ] Page renders under 200ms for clinics with up to 500 active recurrences (the practical ceiling).
- [ ] Unit tests for all helpers in `recurrence-slots.ts`.
- [ ] API route test mocking Prisma covers permission gating + filtering.
- [ ] Build passes (`npm run build`).
- [ ] Manual smoke test on local DB synced from prod: select Elena, verify her recurring REUNIÃO appears in the grid; switch to "Todos"; switch to a different professional.

## Dependencies & Risks

- **Header coupling**: the prof-selector pill row currently lives inline in `AgendaHeader.tsx:208-250` and `weekly/components/WeeklyHeader.tsx`. Two options:
  - **Option A (chosen)**: copy the row into `RecurrenceHeader.tsx` for now. Pragmatic, no refactor risk.
  - **Option B**: extract `ProfessionalSelectorRow` to `src/app/agenda/components/` and reuse in all three. Cleaner but bigger change. Defer to a follow-up if duplication grows painful.
- **Layout duplication**: the recurrence grid will duplicate ~80 lines of weekday/time-grid chrome from `WeeklyGrid.tsx`. Tolerated for now (different data model, different interactions). If a 4th view ever needs the same chrome, extract it then.
- **Monthly weekday drift**: today's MONTHLY recurrence uses "same calendar day of the month", which can land on different weekdays month-to-month (see brainstorm open question). The view will render based on `startDate.getDay()` and the `Xª <weekday>` badge of the **next** upcoming occurrence. A tooltip on the badge will warn "Pode mudar de dia da semana entre meses" when this happens. Future enhancement: introduce a true "Nth weekday of month" recurrence flavor — out of scope.
- **Two color systems coexisting**: per-frequency tint (single-prof mode) and per-professional palette ("Todos" mode). Documented in the legend.
- **Conflicting biweekly parity**: two biweekly recurrences on the same slot with the same parity is a data error (should never happen). The pairing helper returns one with a `conflict: true` flag; UI surfaces with a red border + warning tooltip.

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-05-14-recurrence-slot-view-brainstorm.md](../brainstorms/2026-05-14-recurrence-slot-view-brainstorm.md)
  - Frequency tags `S/Q/M` with per-frequency colors *(see brainstorm: "Frequency tags + colors")*
  - Biweekly par/ímpar split + pair-completion hints *(see brainstorm: "Biweekly slot splitting")*
  - Monthly "Xª semana do mês" badge *(see brainstorm: "Monthly indicator")*
  - Per-professional + "Todos" filter modes *(see brainstorm: "Professional filter")*

### Internal References

- `src/lib/appointments/recurrence.ts:240-256` — `formatRecurrenceLabel`
- `src/app/api/appointments/route.ts:253-340` — biweekly-hint query (closest existing pattern)
- `src/app/agenda/weekly/components/WeeklyGrid.tsx:79-153` — `calculateBlockLayout` reference (won't reuse but informs layout math)
- `src/app/agenda/lib/grid-config.ts` — `WEEKLY_GRID` constants
- `src/app/agenda/lib/grid-geometry.ts` — `minutesToPixel`, `formatTimeFromMinutes`
- `src/app/agenda/lib/hour-range.ts` — `computeHourRange`
- `src/app/agenda/lib/utils.ts:248-280` — `dayGridTemplate`, column widths
- `src/app/agenda/lib/professional-colors.ts` — `PROFESSIONAL_COLORS` + `createProfessionalColorMap`
- `src/app/agenda/context/AgendaContext.tsx` — shared prof/date context
- `src/lib/clinic/colors/` — per-clinic agenda colors (NOT used here — frequency tinting is per-frequency, not per-type)
- `prisma/schema.prisma:633-668` — `AppointmentRecurrence` model
- `prisma/schema.prisma:931` — `RecurrenceProfessional` join table

### Related Plans

- [docs/plans/2026-05-04-001-feat-customizable-agenda-colors-plan.md](2026-05-04-001-feat-customizable-agenda-colors-plan.md) — per-clinic color config (background context; not extended here)

## Out of Scope (YAGNI)

- Drag-and-drop creation of new recurrences from this view
- Editing recurrence inline (deep-link to the existing recurrence-edit modal instead)
- Exceptions / one-off skips (the steady-state grid doesn't depict exceptions)
- Mobile-optimized layout (desktop-first; mobile users would still use the existing weekly view)
- "Nth weekday of month" semantics for MONTHLY (separate feature)
