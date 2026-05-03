"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useMountEffect, useHasMounted } from "@/shared/hooks"
import { XIcon, TrashIcon } from "@/shared/components/ui/icons"
import type { ProfessionalLite, TodoFormData } from "../types"

interface Props {
  initial: TodoFormData
  isNew: boolean
  professionals: ProfessionalLite[]
  hasRecurrence: boolean
  onClose: () => void
  onSave: (data: TodoFormData) => Promise<void>
  onDelete?: () => void
}

export function TodoDrawer({
  initial,
  isNew,
  professionals,
  hasRecurrence,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState<TodoFormData>(initial)
  const [saving, setSaving] = useState(false)
  const mounted = useHasMounted()

  useMountEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  function set<K extends keyof TodoFormData>(k: K, v: TodoFormData[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-[rgba(15,23,41,0.35)] grid place-items-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[520px] max-w-[92vw] max-h-[88vh] bg-card rounded-[14px] flex flex-col overflow-hidden shadow-[0_30px_80px_rgba(15,23,41,0.25)] text-[13px]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="text-[16px] font-bold">
            {isNew ? "Nova tarefa" : "Editar tarefa"}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-[6px] grid place-items-center text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
          <Field label="Título">
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="O que precisa ser feito?"
              className="input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave()
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">
              <input
                type="date"
                value={draft.day}
                onChange={(e) => set("day", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Responsável">
              <select
                value={draft.professionalProfileId}
                onChange={(e) => set("professionalProfileId", e.target.value)}
                className="input"
              >
                {professionals.length === 0 && <option value="">—</option>}
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Status">
            <select
              value={draft.done ? "1" : "0"}
              onChange={(e) => set("done", e.target.value === "1")}
              className="input"
            >
              <option value="0">A fazer</option>
              <option value="1">Concluída</option>
            </select>
          </Field>
          {(isNew || !hasRecurrence) && (
            <RecurrenceSubform draft={draft} setDraft={setDraft} />
          )}
          {!isNew && hasRecurrence && (
            <div className="rounded-[8px] border border-ink-200 bg-ink-50 p-3 text-[12px] text-ink-600">
              Esta tarefa pertence a uma série recorrente. Para alterar a recorrência,
              edite a série na agenda ou exclua e recrie.
            </div>
          )}
          <Field label="Notas">
            <textarea
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Detalhes opcionais"
              rows={3}
              className="input resize-y min-h-[70px]"
            />
          </Field>
        </div>
        <footer className="flex items-center px-5 py-3.5 border-t border-ink-100 gap-2">
          {!isNew && onDelete ? (
            <button
              onClick={() => {
                if (confirm("Excluir esta tarefa?")) onDelete()
              }}
              className="px-3 py-2 rounded-[8px] text-[13px] font-medium text-err-700 hover:bg-err-50 inline-flex items-center gap-1.5"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Excluir
            </button>
          ) : (
            <div />
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-[8px] border border-ink-200 bg-card text-[13px] font-medium hover:bg-ink-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!draft.title.trim() || saving}
              className="px-3.5 py-2 rounded-[8px] text-[13px] font-medium bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </footer>
      </div>
      <style jsx>{`
        .input {
          width: 100%;
          background: white;
          border: 1px solid #e6e8ee;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          color: #0f1729;
          outline: none;
        }
        .input:focus {
          border-color: #3a5cff;
          box-shadow: 0 0 0 3px #eef1ff;
        }
      `}</style>
    </div>,
    document.body
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function RecurrenceSubform({
  draft,
  setDraft,
}: {
  draft: TodoFormData
  setDraft: React.Dispatch<React.SetStateAction<TodoFormData>>
}) {
  const set = <K extends keyof TodoFormData>(k: K, v: TodoFormData[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  return (
    <div className="flex flex-col gap-3">
      <Field label="Recorrência">
        <select
          value={draft.recurrenceType}
          onChange={(e) => set("recurrenceType", e.target.value as TodoFormData["recurrenceType"])}
          className="input"
        >
          <option value="">Sem recorrência</option>
          <option value="WEEKLY">Semanal</option>
          <option value="BIWEEKLY">Quinzenal</option>
          <option value="MONTHLY">Mensal</option>
        </select>
      </Field>
      {draft.recurrenceType && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Termina">
            <select
              value={draft.recurrenceEndType}
              onChange={(e) =>
                set("recurrenceEndType", e.target.value as TodoFormData["recurrenceEndType"])
              }
              className="input"
            >
              <option value="INDEFINITE">Sem fim</option>
              <option value="BY_OCCURRENCES">Após N vezes</option>
              <option value="BY_DATE">Em uma data</option>
            </select>
          </Field>
          {draft.recurrenceEndType === "BY_OCCURRENCES" && (
            <Field label="Ocorrências">
              <input
                type="number"
                min={1}
                max={52}
                value={draft.occurrences}
                onChange={(e) => set("occurrences", parseInt(e.target.value || "0", 10) || 0)}
                className="input"
              />
            </Field>
          )}
          {draft.recurrenceEndType === "BY_DATE" && (
            <Field label="Data final">
              <input
                type="date"
                value={draft.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className="input"
              />
            </Field>
          )}
        </div>
      )}
      <style jsx>{`
        .input {
          width: 100%;
          background: white;
          border: 1px solid #e6e8ee;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
        }
      `}</style>
    </div>
  )
}
