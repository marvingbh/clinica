---
date: 2026-05-03
topic: todos-feature
status: ready
---

# Todos Feature — Implementation Plan

Brainstorm: `docs/brainstorms/2026-05-03-todos-feature-brainstorm.md`.

Each phase ends with `npm run build` + targeted tests. Commit at the end of each phase.

## Phase 1 — Schema + RBAC

**Files**
- `prisma/schema.prisma`
  - `Todo` model: `id`, `clinicId`, `professionalProfileId` (assignee), `title`, `day Date`, `notes String?`, `done Boolean`, `order Int`, `recurrenceId String?`, `createdAt`, `updatedAt`. Indexes on `clinicId`, `professionalProfileId`, `day`, `recurrenceId`.
  - `TodoRecurrence` model: parallels `AppointmentRecurrence` minus the time-slot fields (no `startTime`/`endTime`/`duration`/`modality`/`patientId`). Fields: `id`, `clinicId`, `professionalProfileId`, `title`, `notes String?`, `dayOfWeek Int`, `recurrenceType`, `recurrenceEndType`, `startDate`, `endDate?`, `occurrences?`, `exceptions String[]`, `lastGeneratedDate?`, `isActive`. Reuses `RecurrenceType` + `RecurrenceEndType` enums.
  - Add `todos Todo[]` and `todoRecurrences TodoRecurrence[]` relations to `Clinic` and `ProfessionalProfile`.
- `src/lib/rbac/types.ts` — add `"todos"` to `FEATURES`, label "Tarefas".
- `src/lib/rbac/permissions.ts` — add `todos: "WRITE"` to ADMIN and PROFESSIONAL defaults.
- New migration via `npx prisma migrate dev --name add_todos`.

**Tests:** none yet (schema only). Run `npm run prisma:migrate` and `npm run build`.

## Phase 2 — Domain module: `src/lib/todos/`

Pure functions only — no Prisma. Mirrors `src/lib/appointments/` patterns.

**Files**
- `src/lib/todos/types.ts` — `Todo`, `TodoRecurrence`, view models.
- `src/lib/todos/recurrence.ts` — adapt `appointments/recurrence.ts`:
  - `expandRecurrence(rec, fromDate, toDate)` → array of dates this recurrence yields in the window.
  - `nextOccurrenceAfter(rec, date)` → next date.
  - `shouldExtend(rec, today)` for the cron.
- `src/lib/todos/sort.ts` — combined-list sort: open first by `order`, completed at end by `updatedAt desc`.
- `src/lib/todos/overdue.ts` — `isOverdue(todo, today)` (open + day < today).
- `src/lib/todos/move.ts` — pure date math for menu actions: `today()`, `tomorrow()`, `plusDays(d, n)`, `nextWeek(d)`.
- `src/lib/todos/index.ts` — barrel.
- Colocated `*.test.ts` for each.

**Tests:** recurrence expansion (weekly/biweekly/monthly across DST boundaries, end-by-date, end-by-occurrences, exceptions), overdue, move math, sort.

## Phase 3 — API routes

All authenticated via `withFeatureAuth({ feature: "todos", minAccess: ... })`. Professional scope = filter to `professionalProfileId === user.professionalProfileId` unless ADMIN.

**Files**
- `src/app/api/todos/route.ts`
  - `GET` — list with filters: `from`, `to` (date range for agenda), `status`, `assignee`, `recurrence`, `q` (search). Returns expanded view of recurrent series in the window.
  - `POST` — create (single or recurring; if `recurrence` present, create `TodoRecurrence` + materialize occurrences in current ±2 month window).
- `src/app/api/todos/[id]/route.ts`
  - `GET` — single fetch.
  - `PATCH` — update title/notes/assignee/day/done/recurrence. Editing the parent's recurrence updates the series.
  - `DELETE` — delete a single occurrence (recurrence parent untouched). Bulk-series deletion happens via the parent endpoint.
- `src/app/api/todos/[id]/duplicate/route.ts` — `POST` clone.
- `src/app/api/todos/bulk/route.ts` — `POST { ids, action: "complete" | "uncomplete" | "delete" }`.
- `src/app/api/todos/recurrences/[id]/route.ts` — `DELETE` cancels the series (sets `isActive=false`); `PATCH` edits series defaults.

**Files (cron)**
- Extend `src/app/api/jobs/extend-recurrences/route.ts` to also process `TodoRecurrence` rows where `recurrenceEndType=INDEFINITE` and `lastGeneratedDate < today + horizon`.
- `vercel.json` — no change needed; same cron entry handles both.

**Tests:** integration tests for permission scoping (PROFESSIONAL cannot read other-assignee todos), recurrence expansion correctness on `GET`, bulk action atomicity.

## Phase 4 — Manage page: `/tarefas`

**Files**
- `src/app/tarefas/page.tsx` — server component fetching initial list + professionals.
- `src/app/tarefas/components/`
  - `TodosTable.tsx` — sortable table with row checkbox, per-row actions, completed strikethrough. Use react-hook-form + zod for the drawer form.
  - `TodoStatCards.tsx` — 4 stat cards.
  - `TodoFiltersBar.tsx` — search + status/assignee/recurrence selects.
  - `TodoBulkBar.tsx` — sticky bar shown when `selected.size > 0`.
  - `TodoDrawer.tsx` — edit/create drawer (title, day, assignee, recurrence, status, notes, delete).
  - `TodoRecurrenceFields.tsx` — type/endType/until/occurrences subform, reused from a shared util if one exists in appointments components.
- Wire navigation: add Tarefas item to `src/app/components/Sidebar.tsx` (or wherever the sidebar lives).

**Tests:** component tests for filter logic + sort. Pure logic moves to `src/lib/todos/manage.ts` if non-trivial.

## Phase 5 — Agenda integration

**Files**
- Find the agenda weekly + daily view components (`src/app/agenda/weekly/...` and the daily counterpart).
- New components in `src/app/agenda/components/todos/`:
  - `TodoStrip.tsx` — per-day strip (header, inline add, list, drag drop zone).
  - `TodoCard.tsx` — card with checkbox, title, assignee pill, recurrence pill, notes, hover menu.
  - `TodoInlineAdd.tsx` — collapsed/expanded add input.
  - `TodoMenu.tsx` — popover with Hoje/Amanhã/+1 dia/Próxima semana/Duplicar/Toggle recorrência/Excluir.
- Wrap in a `TodosProvider` (React context) that owns the list of todos for the visible window + mutations. Subscribes to a SWR cache key per `[from, to, assignee filter]`.
- Apply existing professional filter chips to todos by `assignee`.
- Daily view: render one strip above the time grid; drag disabled (the strip uses the same component with a `disableDrag` prop).
- Strip height: compute `maxOpenCount` across the visible days; pass down so each strip caps its list at that height.

**Tests:** interaction tests in vitest are limited; rely on the build + manual smoke. Pure helpers (height calc, sort, filter) tested in `src/lib/todos/`.

## Phase 6 — Cron + final polish

- Smoke-test the cron job locally (it can be hit with curl).
- Add a tiny audit log entry for create/update/delete (matches what appointments do, if they do).
- README/CLAUDE.md: short note that todos exist and where to find them.

## Out of scope

- Notifications/reminders for todos (no time-of-day, so not directly applicable).
- Linking todos to patients or appointments.
- Public sharing/cancel-via-link tokens.
- Mobile-specific UI tweaks beyond what already responds.
- Migrating existing TAREFA-type appointments into todos.

## Verification

- `npm run test` passes.
- `npm run build` passes.
- Manual smoke in browser: create todo from agenda strip, complete it, drag to next day, edit in manage page, bulk-complete, create recurring weekly todo, verify it appears on subsequent weeks.
