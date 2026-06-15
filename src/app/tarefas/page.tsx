"use client"

import { useState, useMemo, useCallback } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { PlusIcon } from "@/shared/components/ui/icons"
import { useRequireAuth, usePermission } from "@/shared/hooks"
import { isOverdue } from "@/lib/todos"
import { TodoStatCards } from "./components/TodoStatCards"
import { TodoFiltersBar } from "./components/TodoFiltersBar"
import { TodosTable } from "./components/TodosTable"
import { TodoBulkBar } from "./components/TodoBulkBar"
import { TodoDrawer, type TodoEditScope } from "@/shared/components/todos/TodoDrawer"
import { TodoDeleteDialog } from "@/shared/components/todos/TodoDeleteDialog"
import { emptyTodoDraft, todoToFormDraft } from "@/shared/components/todos/todoFormDraft"
import { saveTodoFromDraft } from "@/shared/components/todos/saveTodoFromDraft"
import { deleteTodoWithScope } from "@/shared/components/todos/deleteTodoWithScope"
import { Pagination } from "@/shared/components/ui/pagination"
import { loadProfessionals } from "@/lib/professionals/list"

const PAGE_SIZE = 50
import type {
  ProfessionalLite,
  TodoListItem,
  StatusFilter,
  RecurrenceFilter,
  SortKey,
  TodoFormData,
} from "./types"

export default function TarefasPage() {
  const { isReady } = useRequireAuth()
  const { data: session } = useSession()
  const { canWrite } = usePermission("todos")

  const [todos, setTodos] = useState<TodoListItem[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalLite[]>([])
  const [loaded, setLoaded] = useState(false)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all")
  const [recurFilter, setRecurFilter] = useState<RecurrenceFilter>("all")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "day",
    dir: "asc",
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ draft: TodoFormData; isNew: boolean; hasRecurrence: boolean } | null>(null)
  const [deleting, setDeleting] = useState<TodoListItem | null>(null)
  const [page, setPage] = useState(0)

  const isAdmin = session?.user?.role === "ADMIN"

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/todos")
      if (!res.ok) throw new Error("Falha ao carregar tarefas")
      const data = await res.json()
      setTodos(data.todos)
      setLoaded(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar")
    }
  }, [])

  // Auth-readiness data fetch: must re-run when isReady flips true on a direct
  // page load/refresh, so a real useEffect with [isReady, ...] — not useMountEffect.
  useEffect(() => {
    if (!isReady) return
    reload()
    if (isAdmin) {
      loadProfessionals().then(setProfessionals)
    } else if (session?.user?.professionalProfileId) {
      setProfessionals([
        { id: session.user.professionalProfileId, name: session.user.name ?? "Eu" },
      ])
    }
  }, [isReady, isAdmin, session, reload])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return todos
      .filter((t) => {
        if (statusFilter === "open" && t.done) return false
        if (statusFilter === "done" && !t.done) return false
        if (statusFilter === "overdue" && !isOverdue({ done: t.done, day: t.day.slice(0, 10) }))
          return false
        if (assigneeFilter !== "all" && t.professionalProfileId !== assigneeFilter) return false
        if (recurFilter === "none" && t.recurrence) return false
        if (
          (recurFilter === "weekly" || recurFilter === "biweekly" || recurFilter === "monthly") &&
          (!t.recurrence || t.recurrence.recurrenceType.toLowerCase() !== recurFilter)
        )
          return false
        if (q && !(t.title.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q)))
          return false
        return true
      })
      .sort((a, b) => {
        const dir = sort.dir === "asc" ? 1 : -1
        switch (sort.key) {
          case "title":
            return a.title.localeCompare(b.title) * dir
          case "day":
            return a.day.localeCompare(b.day) * dir
          case "assignee":
            return a.professionalProfile.user.name.localeCompare(b.professionalProfile.user.name) * dir
          case "status":
            return ((a.done ? 1 : 0) - (b.done ? 1 : 0)) * dir
        }
      })
  }, [todos, search, statusFilter, assigneeFilter, recurFilter, sort])

  const stats = useMemo(() => {
    const total = todos.length
    const done = todos.filter((t) => t.done).length
    const overdue = todos.filter((t) => isOverdue({ done: t.done, day: t.day.slice(0, 10) })).length
    return { total, done, open: total - done, overdue }
  }, [todos])

  // ----- Mutations -----
  async function saveTodo(draft: TodoFormData, scope?: TodoEditScope) {
    const original = draft.id ? todos.find((t) => t.id === draft.id) : undefined
    const ok = await saveTodoFromDraft(draft, {
      scope,
      recurrenceId: original?.recurrenceId ?? null,
    })
    if (!ok) return
    setEditing(null)
    await reload()
  }

  async function toggleDone(t: TodoListItem) {
    // Optimistic — flip the row immediately so the checkbox feels responsive.
    // On failure we rollback the row from snapshot.
    const snapshot = t
    setTodos((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? { ...x, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null }
          : x
      )
    )
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    })
    if (!res.ok) {
      toast.error("Erro ao atualizar")
      setTodos((prev) => prev.map((x) => (x.id === t.id ? snapshot : x)))
    }
  }

  async function deleteTodo(t: TodoListItem, scope?: TodoEditScope) {
    const ok = await deleteTodoWithScope(t.id, {
      scope,
      recurrenceId: t.recurrenceId,
    })
    if (!ok) return
    if (scope === "all_future") {
      await reload()
    } else {
      setTodos((prev) => prev.filter((x) => x.id !== t.id))
    }
    setSelected((s) => {
      const n = new Set(s)
      n.delete(t.id)
      return n
    })
  }

  async function duplicateTodo(t: TodoListItem) {
    const res = await fetch(`/api/todos/${t.id}/duplicate`, { method: "POST" })
    if (!res.ok) {
      toast.error("Erro ao duplicar")
      return
    }
    toast.success("Duplicada")
    await reload()
  }

  async function bulkAction(action: "complete" | "uncomplete" | "delete") {
    if (selected.size === 0) return
    if (action === "delete" && !confirm(`Excluir ${selected.size} tarefa(s)?`)) return
    const res = await fetch("/api/todos/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action }),
    })
    if (!res.ok) {
      toast.error("Erro na ação em lote")
      return
    }
    setSelected(new Set())
    await reload()
  }

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))
  }
  function startNew() {
    if (!session?.user?.professionalProfileId && !isAdmin) {
      toast.error("Defina um profissional para criar tarefas")
      return
    }
    const defaultProfId = session?.user?.professionalProfileId ?? professionals[0]?.id ?? ""
    setEditing({ draft: emptyTodoDraft(defaultProfId), isNew: true, hasRecurrence: false })
  }
  function startEdit(t: TodoListItem) {
    setEditing({ draft: todoToFormDraft(t), isNew: false, hasRecurrence: !!t.recurrenceId })
  }

  if (!isReady || !loaded) {
    return (
      <div className="p-6 text-ink-500 text-[13px]">Carregando tarefas...</div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 text-[13px] leading-[1.4]">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[12px] text-ink-500">Principal</div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] leading-tight mt-0.5">
            Tarefas
          </h1>
        </div>
        {canWrite && (
          <button
            onClick={startNew}
            className="px-3.5 py-2 rounded-[8px] bg-ink-900 text-white text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-800"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Nova tarefa
          </button>
        )}
      </header>

      <TodoStatCards stats={stats} />

      <TodoFiltersBar
        search={search}
        onSearch={(v) => {
          setSearch(v)
          setPage(0)
        }}
        status={statusFilter}
        onStatus={(v) => {
          setStatusFilter(v)
          setPage(0)
        }}
        assignee={assigneeFilter}
        onAssignee={(v) => {
          setAssigneeFilter(v)
          setPage(0)
        }}
        recurrence={recurFilter}
        onRecurrence={(v) => {
          setRecurFilter(v)
          setPage(0)
        }}
        professionals={professionals}
        canFilterByAssignee={isAdmin}
      />

      {(() => {
        const totalCount = filtered.length
        const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
        const safePage = Math.min(page, totalPages - 1)
        const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
        const hasPagination = totalCount > PAGE_SIZE
        const hasBulk = selected.size > 0
        const tableRounded: "full" | "top" | "bottom" | "middle" = hasBulk
          ? hasPagination
            ? "middle"
            : "bottom"
          : hasPagination
            ? "top"
            : "full"
        return (
          <div>
            <TodoBulkBar
              count={selected.size}
              onComplete={() => bulkAction("complete")}
              onUncomplete={() => bulkAction("uncomplete")}
              onDelete={() => bulkAction("delete")}
              onClear={() => setSelected(new Set())}
            />
            <TodosTable
              todos={paged}
              selected={selected}
              onToggleSelect={toggleSel}
              onSelectAllVisible={() => {
                // "Select all visible" applies to the current page only.
                if (paged.every((t) => selected.has(t.id))) {
                  setSelected((s) => {
                    const n = new Set(s)
                    for (const t of paged) n.delete(t.id)
                    return n
                  })
                } else {
                  setSelected((s) => {
                    const n = new Set(s)
                    for (const t of paged) n.add(t.id)
                    return n
                  })
                }
              }}
              onToggleDone={toggleDone}
              onEdit={startEdit}
              onDuplicate={duplicateTodo}
              onDelete={(t) => setDeleting(t)}
              sort={sort}
              onSort={toggleSort}
              rounded={tableRounded}
            />
            <Pagination
              page={safePage}
              pageSize={PAGE_SIZE}
              total={totalCount}
              onPage={setPage}
            />
          </div>
        )
      })()}

      {editing && (
        <TodoDrawer
          initial={editing.draft}
          isNew={editing.isNew}
          hasRecurrence={editing.hasRecurrence}
          professionals={professionals}
          onClose={() => setEditing(null)}
          onSave={saveTodo}
          onDelete={
            editing.isNew || !editing.draft.id
              ? undefined
              : () => {
                  const t = todos.find((x) => x.id === editing.draft.id)
                  if (t) setDeleting(t)
                }
          }
        />
      )}
      {deleting && (
        <TodoDeleteDialog
          todo={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={async (scope) => {
            const target = deleting
            await deleteTodo(target, scope)
            setDeleting(null)
            setEditing((prev) => (prev?.draft.id === target.id ? null : prev))
          }}
        />
      )}
    </div>
  )
}
