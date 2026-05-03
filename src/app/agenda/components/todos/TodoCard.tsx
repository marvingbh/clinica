"use client"

import { useState } from "react"
import {
  CheckIcon,
  RepeatIcon,
  AlertCircleIcon,
  MoreHorizontalIcon,
} from "@/shared/components/ui/icons"
import { isOverdue, formatTodoRecurrenceSummary } from "@/lib/todos"
import {
  getProfessionalColor,
  type ProfessionalColorMap,
} from "@/app/agenda/lib/professional-colors"
import type { TodoListItem } from "@/app/tarefas/types"
import { TodoMenu } from "./TodoMenu"

interface Props {
  todo: TodoListItem
  draggable?: boolean
  /** When true, only the title is shown by default; metadata and notes are revealed on hover. */
  compact?: boolean
  professionalColorMap: ProfessionalColorMap
  onToggle: (t: TodoListItem) => void
  onMove: (t: TodoListItem, dayIso: string) => void
  onDuplicate: (t: TodoListItem) => void
  onDelete: (t: TodoListItem) => void
  onDragStart?: (e: React.DragEvent, t: TodoListItem) => void
  onDragEnd?: () => void
}

export function TodoCard({
  todo,
  draggable,
  compact,
  professionalColorMap,
  onToggle,
  onMove,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
}: Props) {
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null)
  const overdue = isOverdue({ done: todo.done, day: todo.day.slice(0, 10) })
  const profName = todo.professionalProfile.user.name.split(" ")[0]
  const profColor = getProfessionalColor(todo.professionalProfileId, professionalColorMap)

  return (
    <>
      <div
        draggable={draggable}
        onDragStart={(e) => {
          if (onDragStart) {
            e.dataTransfer.effectAllowed = "move"
            onDragStart(e, todo)
          }
        }}
        onDragEnd={onDragEnd}
        className={`group relative flex flex-col gap-[3px] rounded-[7px] border bg-card px-2 py-1.5 text-[12px] leading-[1.3] cursor-grab active:cursor-grabbing
          ${todo.done ? "opacity-70 bg-ink-50/60" : ""}
          ${overdue ? "border-l-[3px] border-l-err-500 border-ink-200" : "border-l-[3px] border-l-brand-500 border-ink-200"}`}
      >
        <div className="flex items-start gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle(todo)
            }}
            className={`mt-[1px] w-3.5 h-3.5 flex-shrink-0 rounded border grid place-items-center transition-colors ${
              todo.done
                ? "bg-ok-500 border-ok-500 text-white"
                : "bg-white border-ink-300 hover:border-ink-500"
            }`}
            title={todo.done ? "Desmarcar" : "Concluir"}
          >
            {todo.done && <CheckIcon className="w-2 h-2" strokeWidth={3} />}
          </button>
          <div
            className={`flex-1 font-medium break-words ${todo.done ? "line-through text-ink-500" : ""}`}
          >
            {todo.title}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuAt((e.target as HTMLElement).getBoundingClientRect())
            }}
            className="opacity-0 group-hover:opacity-100 w-4 h-4 grid place-items-center text-ink-500 hover:text-ink-800 hover:bg-ink-100 rounded-[4px]"
            title="Ações"
          >
            <MoreHorizontalIcon className="w-3 h-3" />
          </button>
        </div>
        <div
          className={`pl-5 flex flex-wrap gap-1 text-[10.5px] leading-[1.3] ${
            compact ? "hidden group-hover:flex" : ""
          }`}
        >
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-[4px] font-medium ${profColor.bg} ${profColor.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${profColor.accent}`} />
            {profName}
          </span>
          {todo.recurrence && (
            <span className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-[4px] bg-violet-50 text-violet-700 font-medium">
              <RepeatIcon className="w-2.5 h-2.5" />
              {formatTodoRecurrenceSummary(
                todo.recurrence.recurrenceType,
                todo.recurrence.recurrenceEndType,
                todo.recurrence.occurrences,
                todo.recurrence.endDate
              )}
            </span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-[4px] bg-err-50 text-err-700 font-medium">
              <AlertCircleIcon className="w-2.5 h-2.5" />
              atrasada
            </span>
          )}
        </div>
        {todo.notes && (
          <div
            className={`pl-5 text-[11px] text-ink-500 italic leading-[1.3] ${
              compact ? "hidden group-hover:block" : ""
            }`}
          >
            {todo.notes}
          </div>
        )}
      </div>
      {menuAt && (
        <TodoMenu
          todo={todo}
          anchorRect={menuAt}
          onClose={() => setMenuAt(null)}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      )}
    </>
  )
}
