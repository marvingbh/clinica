import { todayIso } from "@/lib/todos"
import type { TodoFormData, TodoListItem } from "@/app/tarefas/types"

/** Empty draft for the "new todo" path. */
export function emptyTodoDraft(professionalProfileId: string): TodoFormData {
  return {
    title: "",
    notes: "",
    day: todayIso(),
    professionalProfileId,
    done: false,
    recurrenceType: "",
    recurrenceEndType: "INDEFINITE",
    occurrences: 8,
    endDate: "",
  }
}

/** Convert an existing todo into the form draft shape. */
export function todoToFormDraft(t: TodoListItem): TodoFormData {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes ?? "",
    day: t.day.slice(0, 10),
    professionalProfileId: t.professionalProfileId,
    done: t.done,
    recurrenceType: t.recurrence?.recurrenceType ?? "",
    recurrenceEndType: t.recurrence?.recurrenceEndType ?? "INDEFINITE",
    occurrences: t.recurrence?.occurrences ?? 8,
    endDate: t.recurrence?.endDate?.slice(0, 10) ?? "",
  }
}
