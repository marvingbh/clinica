"use client"

import { useMemo, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useMountEffect } from "@/shared/hooks"
import { useTodos } from "./useTodos"
import { TodoCard } from "./TodoCard"
import { TodoInlineAdd } from "./TodoInlineAdd"
import { sortCombined, maxOpenCountByDay } from "@/lib/todos"
import { loadProfessionals, type ProfessionalLite } from "@/lib/professionals/list"
import {
  createProfessionalColorMap,
  type ProfessionalColorMap,
} from "@/app/agenda/lib/professional-colors"
import type { TodoListItem } from "@/app/tarefas/types"

interface Props {
  /** YYYY-MM-DD ISO strings, in display order (1 day for daily, 7 for weekly) */
  days: string[]
  /** Filter shown todos to a specific assignee (empty = all) */
  selectedProfessionalId?: string
  /**
   * "row" = one column per day (weekly view) — drag-to-reschedule is enabled.
   * "single" = stacked single strip (daily view) — drag is disabled because
   * there's only one drop zone, so movement happens via the per-card menu.
   */
  layout: "row" | "single"
  /**
   * Map from professionalProfileId → palette index. Pass the same map the
   * agenda uses so todo cards share colors with appointment blocks. If absent,
   * a local map is built from the visible todos + fetched professionals.
   */
  professionalColorMap?: ProfessionalColorMap
}

export function TodosStrip({
  days,
  selectedProfessionalId,
  layout,
  professionalColorMap,
}: Props) {
  const { data: session } = useSession()
  const fromIso = days[0]
  const toIso = days[days.length - 1]
  const isAdmin = session?.user?.role === "ADMIN"
  const myProfId = session?.user?.professionalProfileId ?? ""
  const enableDrag = layout === "row"

  const { todos, quickAdd, toggleDone, moveToDay, duplicate, remove } = useTodos({
    fromIso,
    toIso,
    assigneeFilter: isAdmin ? selectedProfessionalId : myProfId,
  })

  const [professionals, setProfessionals] = useState<ProfessionalLite[]>([])
  useMountEffect(() => {
    if (isAdmin) {
      loadProfessionals().then(setProfessionals)
    } else if (myProfId) {
      setProfessionals([{ id: myProfId, name: session?.user?.name ?? "Eu" }])
    }
  })

  // Build a fallback color map if the parent didn't provide one.
  const fallbackColorMap = useMemo(
    () =>
      createProfessionalColorMap([
        ...todos.map((t) => t.professionalProfileId),
        ...professionals.map((p) => p.id),
      ]),
    [todos, professionals]
  )
  const colorMap = professionalColorMap ?? fallbackColorMap

  const todosByDay = useMemo(() => {
    const map = new Map<string, TodoListItem[]>()
    for (const day of days) map.set(day, [])
    for (const t of todos) {
      const d = t.day.slice(0, 10)
      const list = map.get(d)
      if (list) list.push(t)
    }
    for (const [k, list] of map) {
      map.set(k, sortCombined(list))
    }
    return map
  }, [todos, days])

  const maxOpen = useMemo(() => {
    const flat = todos.map((t) => ({ day: t.day.slice(0, 10), done: t.done }))
    return Math.max(1, maxOpenCountByDay(flat))
  }, [todos])

  const [draggingId, setDraggingId] = useState<string | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, t: TodoListItem) => {
    // Custom MIME so a stray drop into a text field doesn't paste the UUID.
    // Keep `text/plain` only as a fallback for cross-window drags.
    e.dataTransfer.setData("application/x-clinica-todo-id", t.id)
    e.dataTransfer.setData("text/plain", t.id)
    e.dataTransfer.effectAllowed = "move"
    setDraggingId(t.id)
  }, [])
  const handleDragEnd = useCallback(() => setDraggingId(null), [])

  // Belt-and-braces: window-level dragend/drop listeners so `draggingId` is
  // always cleared even when the source element gets unmounted mid-drag (a
  // reload landing during the drag) or the platform skips firing dragend
  // (Safari + Escape, Linux Chrome edge cases).
  useMountEffect(() => {
    const clear = () => setDraggingId(null)
    window.addEventListener("dragend", clear)
    window.addEventListener("drop", clear)
    return () => {
      window.removeEventListener("dragend", clear)
      window.removeEventListener("drop", clear)
    }
  })

  // Per-day drop handlers
  const onDropToDay = useCallback(
    (dayIso: string, e: React.DragEvent) => {
      e.preventDefault()
      const id =
        e.dataTransfer.getData("application/x-clinica-todo-id") ||
        e.dataTransfer.getData("text/plain")
      if (!id) {
        setDraggingId(null)
        return
      }
      const t = todos.find((x) => x.id === id)
      if (t && t.day.slice(0, 10) !== dayIso) moveToDay(t, dayIso)
      setDraggingId(null)
    },
    [todos, moveToDay]
  )

  // When the agenda has a specific professional selected, lock the strip's
  // assignee picker to that professional. Otherwise (admin viewing "Todos") the
  // user can pick any professional from the dropdown.
  const lockedProfId = isAdmin && selectedProfessionalId ? selectedProfessionalId : !isAdmin ? myProfId : ""
  const defaultProfId = lockedProfId || professionals[0]?.id || ""
  const canPickProfessional = !lockedProfId && isAdmin
  const stripHeight = Math.max(140, maxOpen * 56 + 60)

  if (!defaultProfId && !isAdmin) return null

  return (
    <div
      className={
        layout === "row"
          ? "flex border-b border-ink-200 bg-ink-50/30"
          : "border-b border-ink-200 bg-ink-50/30 px-3 py-2"
      }
    >
      {/* Time column spacer to align with weekly grid */}
      {layout === "row" && <div className="w-14 shrink-0 border-r border-ink-200 bg-card" />}
      {days.map((day) => {
        const dayTodos = todosByDay.get(day) ?? []
        const remaining = dayTodos.filter((t) => !t.done).length
        const completed = dayTodos.filter((t) => t.done).length
        return (
          <div
            key={day}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropToDay(day, e)}
            className={
              layout === "row"
                ? "flex-1 min-w-[120px] border-r border-ink-100 last:border-r-0 px-2 py-2 flex flex-col gap-1.5"
                : "flex flex-col gap-1.5"
            }
            style={layout === "row" ? { minHeight: stripHeight } : undefined}
          >
            {layout === "row" && (
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-ink-500 px-0.5 pb-0.5">
                <span>Tarefas</span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-ink-100 text-ink-700 font-semibold">
                  {remaining}
                  {completed > 0 && (
                    <span className="opacity-50 font-normal">· {completed} ✓</span>
                  )}
                </span>
              </div>
            )}
            <TodoInlineAdd
              dayIso={day}
              defaultProfessionalId={defaultProfId}
              professionals={professionals}
              canPickProfessional={canPickProfessional}
              onAdd={quickAdd}
            />
            <div
              className="flex flex-col gap-1.5 overflow-y-auto"
              style={layout === "row" ? { maxHeight: maxOpen * 60 } : undefined}
            >
              {dayTodos.map((t) => (
                <div key={t.id} className={t.id === draggingId ? "opacity-40" : ""}>
                  <TodoCard
                    todo={t}
                    draggable={enableDrag}
                    professionalColorMap={colorMap}
                    onToggle={toggleDone}
                    onMove={moveToDay}
                    onDuplicate={duplicate}
                    onDelete={remove}
                    onDragStart={enableDrag ? handleDragStart : undefined}
                    onDragEnd={enableDrag ? handleDragEnd : undefined}
                  />
                </div>
              ))}
              {dayTodos.length === 0 && (
                <div className="text-[11px] italic text-ink-400 px-1 py-1">Sem tarefas</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
