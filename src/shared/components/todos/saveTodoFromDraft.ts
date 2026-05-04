import { toast } from "sonner"
import type { TodoFormData } from "@/app/tarefas/types"
import type { TodoEditScope } from "./TodoDrawer"

interface SaveOptions {
  scope?: TodoEditScope
  /** Required when `scope === "all_future"` so we can hit the recurrence endpoint. */
  recurrenceId?: string | null
}

/**
 * Persists a TodoFormData draft. Keeps the routing logic for new vs. edit and
 * for "this only" vs. "all future" scope in one place so the agenda strip and
 * the /tarefas page stay consistent.
 *
 * Returns true on success (caller may want to close a drawer); false on
 * failure (the toast is already shown).
 */
export async function saveTodoFromDraft(
  draft: TodoFormData,
  options: SaveOptions = {},
): Promise<boolean> {
  const isNew = !draft.id

  if (!isNew && options.scope === "all_future" && options.recurrenceId) {
    // Series fields cascade to undone future occurrences via the recurrence
    // endpoint; per-occurrence fields stay scoped to this row.
    const recRes = await fetch(`/api/todos/recurrences/${options.recurrenceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draft.title, notes: draft.notes || null }),
    })
    if (!recRes.ok) {
      const err = await recRes.json().catch(() => ({}))
      toast.error(err.error ?? "Erro ao atualizar série")
      return false
    }
    const occRes = await fetch(`/api/todos/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day: draft.day,
        professionalProfileId: draft.professionalProfileId,
        done: draft.done,
      }),
    })
    if (!occRes.ok) {
      const err = await occRes.json().catch(() => ({}))
      toast.error(err.error ?? "Erro ao atualizar ocorrência")
      return false
    }
    toast.success("Série atualizada")
    return true
  }

  const url = isNew ? "/api/todos" : `/api/todos/${draft.id}`
  const method = isNew ? "POST" : "PATCH"
  const recurrence =
    isNew && draft.recurrenceType
      ? {
          recurrenceType: draft.recurrenceType,
          recurrenceEndType: draft.recurrenceEndType,
          ...(draft.recurrenceEndType === "BY_OCCURRENCES" && { occurrences: draft.occurrences }),
          ...(draft.recurrenceEndType === "BY_DATE" && { endDate: draft.endDate }),
        }
      : undefined
  const body = isNew
    ? {
        title: draft.title,
        notes: draft.notes || null,
        day: draft.day,
        professionalProfileId: draft.professionalProfileId,
        done: draft.done,
        ...(recurrence && { recurrence }),
      }
    : {
        title: draft.title,
        notes: draft.notes || null,
        day: draft.day,
        professionalProfileId: draft.professionalProfileId,
        done: draft.done,
      }
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    toast.error(err.error ?? "Erro ao salvar tarefa")
    return false
  }
  toast.success(isNew ? "Tarefa criada" : "Tarefa atualizada")
  return true
}
