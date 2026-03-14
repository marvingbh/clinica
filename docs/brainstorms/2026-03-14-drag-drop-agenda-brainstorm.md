---
date: 2026-03-14
topic: drag-drop-agenda
---

# Drag & Drop for Agenda (Daily & Weekly Views)

## What We're Building

Add drag-and-drop rescheduling to both the daily (`DailyOverviewGrid`) and weekly (`WeeklyGrid`) agenda views. Users can grab an appointment block and drag it to a new time slot (and in weekly view, a new day column) to reschedule it instantly — without opening the edit form sheet.

## Key Decisions

- **Library**: `@dnd-kit` — modern, lightweight, excellent React DnD primitives
- **Draggable types**: All appointment types (CONSULTA, TAREFA, REUNIAO, LEMBRETE, NOTA)
- **Draggable statuses**: Only active appointments (AGENDADO, CONFIRMADO). Completed/cancelled are non-draggable.
- **Snap**: 15-minute intervals (matches existing grid click behavior)
- **Conflicts**: Prevent the drop — show visual feedback that the target slot is blocked
- **Recurring appointments**: Show a dialog asking "move just this occurrence" or "all future occurrences"
  - Single occurrence → create recurrence exception + move the one appointment
  - All future → update recurrence pattern + bulk-move future appointments
- **Visual feedback**: Ghost/shadow of the appointment follows the cursor; target time slot is highlighted
- **Platform**: Desktop only (mouse). Mobile stays click-to-edit.

## Why This Approach

The agenda already uses absolute pixel positioning with `PIXELS_PER_MINUTE` constants, making it straightforward to reverse-calculate time from drop position. The existing `PATCH /api/appointments/:id` endpoint already handles time changes with conflict checking and audit logging — we reuse that. `@dnd-kit` is the modern standard for React DnD with first-class support for grid/sortable layouts.

Preventing conflicting drops (rather than allowing with a warning) keeps the UX clean — the user sees immediately where they can and can't drop. This avoids the frustration of dragging, dropping, then getting an error dialog.

Desktop-only keeps scope manageable. Touch DnD has different UX challenges (long-press, scroll interference) that can be added later.

## Open Questions

- Should we show a brief toast confirmation after a successful drop-to-reschedule? (e.g., "Moved to 14:30")
- For the recurrence dialog, should "all future" include or exclude the dragged occurrence's original date?
- Should there be an undo action (toast with undo button) after a drop?

## Next Steps

→ `/ce:plan` for implementation details
