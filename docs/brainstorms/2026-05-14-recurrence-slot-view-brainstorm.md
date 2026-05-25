---
date: 2026-05-14
topic: recurrence-slot-view
---

# Visão de Slots por Recorrência

## What We're Building

A new weekly-grid view in the agenda that surfaces **only recurring appointments** (`WEEKLY`, `BIWEEKLY`, `MONTHLY`) so the operator can quickly answer: *"where can I fit another recurring patient?"* The current weekly view mixes one-off appointments and recurrences, which hides the recurring-slot grid the user actually needs to plan with.

The grid uses the same time-of-day × weekday layout as the regular weekly view, but each cell only shows recurring entries — never ad-hoc appointments. Empty cells = available for a new recurring patient.

## Why This Approach

Three options were considered: tag-only (A), color-only (B), pair-matching (C). The user chose a **hybrid**: tags identify the frequency, colors distinguish frequency types, biweekly slots can be split between two biweekly patients (par/ímpar), and a "vaga par/ímpar" hint surfaces pair-completable biweekly slots.

## Key Decisions

- **Source of truth.** Query `AppointmentRecurrence` directly (filtered to `isActive=true` and within the viewing window). Do NOT fetch from `Appointment` — one-off appointments are intentionally excluded.

- **Frequency tags + colors.** Each recurring slot displays a tag and a color:
  - `S` weekly (red/strong)
  - `Q` quinzenal (yellow/medium)
  - `M` mensal (blue/light)

- **Biweekly slot splitting.** A biweekly slot only occupies half the slot's visual space. The other half shows `Vaga (par)` or `Vaga (ímpar)` so the operator can drop another biweekly patient there. Two biweeklies sharing the slot (one par + one ímpar) render as a full split: patient on each half.

- **Par/ímpar reference.** Defined by ISO week number parity. Each `BIWEEKLY` recurrence's reference week is derived from its `startDate` — the view shows both occurrences (par and ímpar) regardless of which week the user is browsing.

- **Monthly indicator.** Monthly recurrences show on their weekday with a "Xª semana do mês" badge (e.g., "2ª terça do mês"). They display every week of the view, but the badge makes clear which week actually has the appointment. Caveat: today's MONTHLY recurrence is "same day of the month" (so weekday can drift). We'll show it on the *current month's* weekday and note the drift.

- **Professional filter.** Two modes:
  - **Per-professional** (default): clean grid for one professional.
  - **Todos**: side-by-side cards per slot, color-coded by professional (same pattern as the current weekly view).

- **Out of scope (YAGNI).** No drag-and-drop creation, no exceptions handling (exceptions are temporary; slot planning works against the steady-state pattern), no edit-in-place from this view (deep-link to existing recurrence edit modal instead).

## Open Questions

- **MONTHLY semantics drift.** Should we surface a warning when a monthly recurrence's weekday changes month-to-month, or just treat the badge as "approximate"? Probably leave for the plan phase.
- **Hour range.** Likely reuse the current weekly view's working-hours window. Confirm in planning.

## Next Steps

→ Run `/ce:plan` to produce the implementation plan from this brainstorm.
