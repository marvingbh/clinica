"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import type { TodoListItem } from "@/app/tarefas/types"

export interface UseTodosArgs {
  fromIso: string
  toIso: string
  assigneeFilter?: string // professionalProfileId or empty for all
}

export function useTodos({ fromIso, toIso, assigneeFilter }: UseTodosArgs) {
  const [todos, setTodos] = useState<TodoListItem[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ from: fromIso, to: toIso })
    if (assigneeFilter) params.set("assignee", assigneeFilter)
    const res = await fetch(`/api/todos?${params}`)
    if (!res.ok) {
      toast.error("Erro ao carregar tarefas")
      setLoading(false)
      return
    }
    const data = await res.json()
    setTodos(data.todos ?? [])
    setLoading(false)
  }, [fromIso, toIso, assigneeFilter])

  useMountEffect(() => {
    reload()
  })

  // refetch when window changes
  if (typeof window !== "undefined") {
    // useEffect-style refetch must run when args change — but we forbid useEffect.
    // We re-run reload via a key prop: parent should pass a key based on `${fromIso}_${toIso}_${assigneeFilter}`.
    // For simplicity here, we expose reload() and let callers trigger it.
  }

  async function quickAdd(args: {
    day: string
    title: string
    professionalProfileId: string
    notes?: string
    recurrence?: { recurrenceType: "WEEKLY" | "BIWEEKLY" | "MONTHLY"; recurrenceEndType: "INDEFINITE" }
  }) {
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Erro ao criar")
      return
    }
    await reload()
  }

  async function toggleDone(t: TodoListItem) {
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null } : x))
    )
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    })
    if (!res.ok) {
      toast.error("Erro ao atualizar")
      await reload()
    }
  }

  async function moveToDay(t: TodoListItem, dayIso: string) {
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, day: dayIso + "T12:00:00.000Z" } : x)))
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: dayIso }),
    })
    if (!res.ok) {
      toast.error("Erro ao mover")
      await reload()
    }
  }

  async function duplicate(t: TodoListItem) {
    const res = await fetch(`/api/todos/${t.id}/duplicate`, { method: "POST" })
    if (!res.ok) {
      toast.error("Erro ao duplicar")
      return
    }
    await reload()
  }

  async function remove(t: TodoListItem) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id))
    const res = await fetch(`/api/todos/${t.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Erro ao excluir")
      await reload()
    }
  }

  return { todos, loading, reload, quickAdd, toggleDone, moveToDay, duplicate, remove }
}
