"use client"

import { createPortal } from "react-dom"
import { useMountEffect } from "@/shared/hooks"
import { TrashIcon, XIcon } from "@/shared/components/ui/icons"
import type { TodoListItem } from "@/app/tarefas/types"
import type { TodoEditScope } from "./TodoDrawer"

interface Props {
  todo: TodoListItem
  onClose: () => void
  onConfirm: (scope?: TodoEditScope) => void
  isProcessing?: boolean
}

/**
 * Confirms deletion of a todo. For recurring todos, surfaces the scope choice
 * (this occurrence vs. this and all future) — mirrors the recurrence delete UX
 * used elsewhere in the agenda.
 */
export function TodoDeleteDialog({ todo, onClose, onConfirm, isProcessing = false }: Props) {
  const isRecurring = !!todo.recurrenceId

  useMountEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-[rgba(15,23,41,0.45)] grid place-items-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[440px] max-w-[92vw] bg-card rounded-[14px] flex flex-col overflow-hidden shadow-[0_30px_80px_rgba(15,23,41,0.25)] text-[13px]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="text-[15px] font-bold flex items-center gap-2 text-err-700">
            <TrashIcon className="w-4 h-4" />
            Excluir tarefa
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-[6px] grid place-items-center text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </header>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-ink-700">
            Tem certeza que deseja excluir{" "}
            <strong className="font-semibold">&ldquo;{todo.title}&rdquo;</strong>?
          </p>
          {isRecurring && (
            <p className="text-[12px] text-ink-500">
              Esta tarefa pertence a uma série recorrente. Escolha o que excluir:
            </p>
          )}
        </div>
        <footer className="flex flex-col gap-2 px-5 py-4 border-t border-ink-100">
          {isRecurring ? (
            <>
              <ConfirmButton
                onClick={() => onConfirm("this_only")}
                disabled={isProcessing}
                title="Apenas esta tarefa"
                hint="Outras ocorrências da série permanecem."
              />
              <ConfirmButton
                onClick={() => onConfirm("all_future")}
                disabled={isProcessing}
                title="Esta e todas as futuras"
                hint="Encerra a série; ocorrências passadas e concluídas permanecem."
                danger
              />
            </>
          ) : (
            <ConfirmButton
              onClick={() => onConfirm()}
              disabled={isProcessing}
              title="Excluir tarefa"
              hint="Esta ação não pode ser desfeita."
              danger
            />
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="h-9 rounded-[8px] border border-ink-200 bg-card text-[13px] font-medium hover:bg-ink-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function ConfirmButton({
  onClick,
  disabled,
  title,
  hint,
  danger,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  hint: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-3 rounded-[8px] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? "border-err-200 bg-err-50 text-err-800 hover:bg-err-100"
          : "border-ink-200 bg-card text-ink-800 hover:bg-ink-50"
      }`}
    >
      <span className="block text-[13px] font-semibold">{title}</span>
      <span className="block text-[11px] mt-0.5 opacity-80">{hint}</span>
    </button>
  )
}
