"use client"

import { useState, useMemo, useCallback } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { PlusIcon } from "@/shared/components/ui/icons"
import { useRequireAuth, usePermission, useMountEffect } from "@/shared/hooks"
import { isOverdue } from "@/lib/todos"
import { TodoStatCards } from "./components/TodoStatCards"
import { TodoFiltersBar } from "./components/TodoFiltersBar"
import { TodosTable } from "./components/TodosTable"
import { TodoBulkBar } from "./components/TodoBulkBar"
import { TodoDrawer } from "./components/TodoDrawer"
import { Pagination } from "@/shared/components/ui/pagination"

const PAGE_SIZE = 50
import type {
  ProfessionalLite,
  TodoListItem,
  StatusFilter,
  RecurrenceFilter,
  SortKey,
  TodoFormData,
} from "./types"

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function emptyDraft(professionalProfileId: string): TodoFormData {
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

function todoToDraft(t: TodoListItem): TodoFormData {
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

  useMountEffect(() => {
    if (!isReady) return
    reload()
    if (isAdmin) {
      fetch("/api/professionals")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return
          // /api/professionals returns User objects; the assignee id is the nested professionalProfile.id.
          const list: ProfessionalLite[] = (data.professionals ?? [])
            .filter((p: { professionalProfile?: { id: string } }) => p.professionalProfile?.id)
            .map((p: { name: string; professionalProfile: { id: string } }) => ({
              id: p.professionalProfile.id,
              name: p.name,
            }))
          setProfessionals(list)
        })
    } else if (session?.user?.professionalProfileId) {
      setProfessionals([
        { id: session.user.professionalProfileId, name: session.user.name ?? "Eu" },
      ])
    }
  })

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
  async function saveTodo(draft: TodoFormData) {
    const isNew = !draft.id
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
      return
    }
    toast.success(isNew ? "Tarefa criada" : "Tarefa atualizada")
    setEditing(null)
    await reload()
  }

  async function toggleDone(t: TodoListItem) {
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    })
    if (!res.ok) {
      toast.error("Erro ao atualizar")
      return
    }
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null } : x))
    )
  }

  async function deleteTodo(id: string) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Erro ao excluir")
      return
    }
    setTodos((prev) => prev.filter((t) => t.id !== id))
    setSelected((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
    toast.success("Tarefa excluída")
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
    setEditing({ draft: emptyDraft(defaultProfId), isNew: true, hasRecurrence: false })
  }
  function startEdit(t: TodoListItem) {
    setEditing({ draft: todoToDraft(t), isNew: false, hasRecurrence: !!t.recurrenceId })
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
              onDelete={(t) => {
                if (confirm(`Excluir "${t.title}"?`)) deleteTodo(t.id)
              }}
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
                  if (editing.draft.id) {
                    deleteTodo(editing.draft.id)
                    setEditing(null)
                  }
                }
          }
        />
      )}
    </div>
  )
}
