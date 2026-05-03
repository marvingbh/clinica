"use client"

import { createPortal } from "react-dom"
import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import {
  CalendarIcon,
  ArrowRightIcon,
  CopyIcon,
  TrashIcon,
} from "@/shared/components/ui/icons"
import { addDays, todayIso, tomorrowIso, nextWeekIso } from "@/lib/todos"
import type { TodoListItem } from "@/app/tarefas/types"

interface Props {
  todo: TodoListItem
  anchorRect: DOMRect
  onClose: () => void
  onMove: (t: TodoListItem, dayIso: string) => void
  onDuplicate: (t: TodoListItem) => void
  onDelete: (t: TodoListItem) => void
}

export function TodoMenu({ todo, anchorRect, onClose, onMove, onDuplicate, onDelete }: Props) {
  const [pos] = useState({
    left: Math.min(window.innerWidth - 220, anchorRect.right - 200),
    top: anchorRect.bottom + 6,
  })

  useMountEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest("[data-todo-menu]")) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handle), 0)
    document.addEventListener("keydown", onKey)
    return () => {
      clearTimeout(id)
      document.removeEventListener("mousedown", handle)
      document.removeEventListener("keydown", onKey)
    }
  })

  const today = todayIso()
  const todoDay = todo.day.slice(0, 10)

  return createPortal(
    <div
      data-todo-menu
      className="fixed z-[100] min-w-[200px] rounded-[10px] border border-ink-200 bg-card shadow-xl py-1 text-[12.5px]"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        Mover para
      </div>
      <Item
        icon={<CalendarIcon className="w-3.5 h-3.5" />}
        onClick={() => {
          onMove(todo, today)
          onClose()
        }}
      >
        Hoje
      </Item>
      <Item
        icon={<ArrowRightIcon className="w-3.5 h-3.5" />}
        onClick={() => {
          onMove(todo, tomorrowIso())
          onClose()
        }}
      >
        Amanhã
      </Item>
      <Item
        icon={<ArrowRightIcon className="w-3.5 h-3.5" />}
        onClick={() => {
          onMove(todo, addDays(todoDay, 1))
          onClose()
        }}
      >
        +1 dia
      </Item>
      <Item
        icon={<ArrowRightIcon className="w-3.5 h-3.5" />}
        onClick={() => {
          onMove(todo, nextWeekIso(todoDay))
          onClose()
        }}
      >
        Próxima semana
      </Item>
      <div className="h-px bg-ink-100 my-1" />
      <Item
        icon={<CopyIcon className="w-3.5 h-3.5" />}
        onClick={() => {
          onDuplicate(todo)
          onClose()
        }}
      >
        Duplicar
      </Item>
      <div className="h-px bg-ink-100 my-1" />
      <Item
        danger
        icon={<TrashIcon className="w-3.5 h-3.5" />}
        onClick={() => {
          if (confirm(`Excluir "${todo.title}"?`)) onDelete(todo)
          onClose()
        }}
      >
        Excluir
      </Item>
    </div>,
    document.body
  )
}

function Item({
  icon,
  onClick,
  danger,
  children,
}: {
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-ink-50 ${
        danger ? "text-err-700 hover:bg-err-50" : "text-ink-800"
      }`}
    >
      <span className={danger ? "text-err-600" : "text-ink-500"}>{icon}</span>
      {children}
    </button>
  )
}
