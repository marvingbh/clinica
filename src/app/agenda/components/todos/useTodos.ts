"use client"

import { useCallback, useRef, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { toast } from "sonner"
import type { TodoListItem } from "@/app/tarefas/types"

export interface UseTodosArgs {
  fromIso: string
  toIso: string
  assigneeFilter?: string // professionalProfileId or empty for all
}

export function useTodos({ fromIso, toIso, assigneeFilter }: UseTodosArgs) {
  const [todos, setTodos] = useState<TodoListItem[]>([])
  const [loading, setLoading] = useState(true)
  const reqIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  // Per-id snapshots taken before optimistic mutations so we can roll back
  // exactly the affected todo on failure without clobbering concurrent edits.
  const snapshotsRef = useRef<Map<string, TodoListItem>>(new Map())

  const reload = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const reqId = ++reqIdRef.current

    const params = new URLSearchParams({ from: fromIso, to: toIso })
    if (assigneeFilter) params.set("assignee", assigneeFilter)
    try {
      const res = await fetch(`/api/todos?${params}`, { signal: controller.signal })
      if (!res.ok) {
        toast.error("Erro ao carregar tarefas")
        return
      }
      const data = await res.json()
      // Drop stale responses — only the latest reload wins.
      if (reqId !== reqIdRef.current) return
      setTodos(data.todos ?? [])
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      toast.error("Erro ao carregar tarefas")
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [fromIso, toIso, assigneeFilter])

  useEffect(() => {
    reload()
    return () => abortRef.current?.abort()
  }, [reload])

  function snapshot(t: TodoListItem) {
    if (!snapshotsRef.current.has(t.id)) {
      snapshotsRef.current.set(t.id, t)
    }
  }
  function rollback(id: string) {
    const snap = snapshotsRef.current.get(id)
    if (!snap) return
    setTodos((prev) => prev.map((x) => (x.id === id ? snap : x)))
    snapshotsRef.current.delete(id)
  }
  function commit(id: string) {
    snapshotsRef.current.delete(id)
  }

  async function quickAdd(args: {
    day: string
    title: string
    professionalProfileId: string
    notes?: string
    recurrenceType?: "WEEKLY" | "BIWEEKLY" | "MONTHLY"
  }) {
    const { recurrenceType, ...rest } = args
    const body = recurrenceType
      ? { ...rest, recurrence: { recurrenceType, recurrenceEndType: "INDEFINITE" as const } }
      : rest
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Erro ao criar")
      return
    }
    await reload()
  }

  async function toggleDone(t: TodoListItem) {
    snapshot(t)
    setTodos((prev) =>
      prev.map((x) =>
        x.id === t.id ? { ...x, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null } : x
      )
    )
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    })
    if (!res.ok) {
      toast.error("Erro ao atualizar")
      rollback(t.id)
      return
    }
    commit(t.id)
  }

  async function moveToDay(t: TodoListItem, dayIso: string) {
    snapshot(t)
    // Preserve the server's day shape — the API serializes `day` (Date column)
    // back as `YYYY-MM-DDT00:00:00.000Z`. Mirror that locally to avoid a
    // post-reload flicker if anything sorts on the time portion.
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, day: dayIso + "T00:00:00.000Z" } : x))
    )
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: dayIso }),
    })
    if (!res.ok) {
      toast.error("Erro ao mover")
      rollback(t.id)
      return
    }
    commit(t.id)
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
    snapshot(t)
    setTodos((prev) => prev.filter((x) => x.id !== t.id))
    const res = await fetch(`/api/todos/${t.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Erro ao excluir")
      rollback(t.id)
      return
    }
    commit(t.id)
  }

  return { todos, loading, reload, quickAdd, toggleDone, moveToDay, duplicate, remove }
}
