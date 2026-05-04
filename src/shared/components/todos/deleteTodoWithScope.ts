import { toast } from "sonner"
import type { TodoEditScope } from "./TodoDrawer"

interface Options {
  scope?: TodoEditScope
  /** Required when `scope === "all_future"` so we hit the recurrence endpoint. */
  recurrenceId?: string | null
}

/**
 * Deletes a todo. With `scope === "all_future"` and a recurrenceId, calls
 * the recurrence endpoint which deactivates the series and removes future
 * undone occurrences. Otherwise deletes only the given todo.
 *
 * Returns true on success (toast already shown on failure).
 */
export async function deleteTodoWithScope(todoId: string, options: Options = {}): Promise<boolean> {
  if (options.scope === "all_future" && options.recurrenceId) {
    const res = await fetch(`/api/todos/recurrences/${options.recurrenceId}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Erro ao excluir série")
      return false
    }
    toast.success("Série encerrada")
    return true
  }

  const res = await fetch(`/api/todos/${todoId}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    toast.error(err.error ?? "Erro ao excluir")
    return false
  }
  toast.success("Tarefa excluída")
  return true
}
