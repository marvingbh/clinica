---
date: 2026-05-03
topic: todos-feature
---

# Todos (Tarefas) Feature

## What We're Building

A standalone "Tarefas" feature with two surfaces:

1. **Agenda integration** — a per-day strip at the top of each column in the weekly view (and a single strip above the time grid in the daily view). Inline add, checkbox toggle, drag between days (weekly only), per-card menu for move/duplicate/delete. Existing per-professional filter chips also filter todos by assignee. Strip height is uniform across visible days, capped at the day with the most open todos; completed todos sit at the bottom of the same list.

2. **Tarefas Manage page** (`/tarefas`) — full CRUD over todos: stat cards (total / a fazer / concluídas % / atrasadas), search across title+notes, status/responsável/recorrência filters, sortable table, multi-select bulk bar (Concluir / Reabrir / Excluir), edit drawer with delete, "Nova tarefa" button.

A todo has: `title`, `day` (date, no time-of-day), `assignee` (professional), `recurrence`, `notes`, `done`. No patient, no time, no priority, no category.

## Why This Approach

The design was iterated through HTML/JSX prototypes; the chat transcript shows the user converged on a minimal model after several reductions (priority, time, category all explicitly removed). We honor that minimalism while wiring it into the existing multi-tenant SaaS plumbing (Prisma, RBAC, domain modules, cron jobs).

Recurrence mirrors `AppointmentRecurrence` rather than reinventing because the user explicitly asked for parity ("the todos can be with the same recurrence of appointments should follow the same logic"). This means a parallel `TodoRecurrence` parent + child `Todo` instances + the existing `extend-recurrences` cron extended to also extend todos. Heavier than a flat enum on Todo, but consistent with the codebase and gives biweekly + indefinite + by-occurrences support for free.

## Key Decisions

- **Recurrence: full parity with appointments.** New `TodoRecurrence` table parallel to `AppointmentRecurrence` (WEEKLY/BIWEEKLY/MONTHLY × BY_DATE/BY_OCCURRENCES/INDEFINITE + exceptions[]). The existing `/api/jobs/extend-recurrences` cron is extended to also extend INDEFINITE todo recurrences. Reuse `RecurrenceType` and `RecurrenceEndType` enums.
- **Permissions: new `todos` feature** in the RBAC enum. Default WRITE for ADMIN and PROFESSIONAL. Professionals see/edit only todos assigned to themselves; admins see all.
- **No patient association.** Standalone tasks only. The existing `AppointmentType.TAREFA` covers the patient-linked case.
- **Daily view: same strip, no horizontal drag.** Movement via the per-card menu (Hoje / Amanhã / +1 dia / Próxima semana). The same menu fallback is available in weekly view, which also supports drag.
- **Tenant scoping:** `clinicId` on Todo and TodoRecurrence, indexed.
- **Domain module:** `src/lib/todos/` with pure recurrence/expansion/move/complete logic + colocated tests. API routes are thin adapters.
- **Sidebar nav:** new "Tarefas" item between Agenda and Pacientes, with the design's checklist icon.
- **Day field type:** `Date @db.Date` (no time component) — todos are date-bound, not time-bound.

## Open Questions

- **Touch/mobile drag in weekly:** drag-and-drop on touch is fragile. Acceptable to require menu-only for touch users? (Default: yes — same fallback as daily.)
- **What happens when a recurring todo is checked done?** Two options: (a) only the current occurrence is marked done; the parent recurrence keeps generating future ones, or (b) checking done on the current instance hides only that instance, future ones generate normally. Default: (a) — `done` lives on the child Todo, not the parent recurrence.
- **Bulk actions on recurring todos:** if you bulk-delete a recurring todo, do we delete only that occurrence or the whole series? Default: delete only the occurrence. To stop the series, edit the parent and deactivate.

## Next Steps

→ Phased implementation plan written below in `docs/plans/2026-05-03-todos-feature-plan.md`.
