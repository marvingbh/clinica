---
date: 2026-05-04
topic: customizable-agenda-colors
---

# Customizable Agenda Colors per Clinic

## What We're Building

In the agenda (weekly + daily), an appointment block's color today comes from the assigned professional's palette slot. This works when "Todos" is selected (each professional gets a distinct color), but is unhelpful when a single professional is filtered — every block looks the same.

This change introduces **type-based coloring** that activates only when a single professional is selected, plus a **per-clinic settings page** where an ADMIN can pick the color used for each appointment type / agenda surface. Defaults match the user's request: Consulta=red, Reunião=blue, Lembrete=yellow, Sessão em grupo=violet, Disponível=green. The "Todos" view keeps today's professional-palette behavior unchanged.

The agenda creation menu also drops the now-redundant **Tarefa** and **Nota** entries (those live in the dedicated `/tarefas` page). Existing TAREFA/NOTA records continue to render with their current constants for legacy compatibility.

## Why This Approach

Three approaches were weighed:
- **(a) Hard-coded defaults only** — fastest to ship, but ignores the user's "I want this configurable per clinic" goal.
- **(b) Settings UI from day 1** — chosen.
- **(c) Hybrid (a now, b later)** — rejected; user explicitly wants config now.

For the picker UX, we picked a **Tailwind palette dropdown** over a free hex picker. Reasons: defaults already map cleanly to Tailwind palettes, derived shades (50/200/500/700) come for free and stay visually consistent, no risk of clinic admins picking low-contrast colors, and the picker is just a 16-swatch grid (no external lib).

## Key Decisions

- **Activation rule**: single professional selected → type-based colors. "Todos" → existing professional palette. No user toggle; the rule follows from the selector state.
- **Storage**: single JSONB column `agendaColors` on `Clinic`. Adding a sixth color slot later won't need a migration.
- **Picker**: Tailwind palette dropdown. ~16 named palettes (red, orange, amber, yellow, lime, green, emerald, teal, sky, blue, indigo, violet, purple, fuchsia, pink, rose, slate). DB stores one short string per slot (e.g. `"red"`).
- **Slots that are configurable** (5):
  - `consulta` — Consulta appointments (default `"red"`)
  - `reuniao` — Reunião appointments (default `"blue"`)
  - `lembrete` — Lembrete appointments (default `"yellow"`)
  - `groupSession` — Therapy group sessions (default `"violet"`)
  - `availability` — Available time slots / "Disponivel" blocks (default `"green"`)
- **Tarefa / Nota**: removed from the agenda create-menu (they live in `/tarefas` now). NOT configurable in settings. Existing records still render via the legacy `ENTRY_TYPE_COLORS` constants — no data migration needed.
- **Scope**: applies to both the weekly view (`AppointmentBlock`, `GroupSessionBlock`, `AvailabilitySlotBlock`) and the daily view (`AppointmentCard`, `GroupSessionCard`, etc.). Same source of truth.
- **Cancelled / Finalized states**: unchanged — `opacity-50` / `opacity-60` continue to overlay on whatever background color is computed.
- **Settings UI**: new tab in `/settings` (the existing settings layout), focused on the 5 color slots with a small swatch grid per slot and a live preview.
- **Permissions**: ADMIN only. Use `withFeatureAuth` with the appropriate feature flag — likely a new `clinic_settings` feature or the existing settings feature with `WRITE` access (decide during planning).

## Open Questions

- **Existing `/settings` layout** — confirm during planning whether it's already tabbed or flat. If flat, this work also adds the tab shell.
- **Live preview in the settings page** — nice-to-have. Defer unless implementation cost is trivial.
- **Group session vs Reunião** — both currently render violet. After this change, group sessions stay violet (default) and Reunião becomes blue. Worth a quick sanity check that `GroupSessionBlock` reads from `groupSession` slot, not `reuniao`.
- **Agenda print views** — `WeeklyPrintGrid` / `AgendaPrintView` should also pick up the new colors. Verify in plan.

## Next Steps

→ `/ce:plan` to expand into a step-by-step implementation plan with file-level changes, schema migration, and the settings UI structure.
