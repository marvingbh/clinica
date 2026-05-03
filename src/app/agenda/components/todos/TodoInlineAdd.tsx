"use client"

import { useRef, useState } from "react"
import { PlusIcon } from "@/shared/components/ui/icons"
import type { ProfessionalLite } from "@/app/tarefas/types"

type RecurrenceChoice = "" | "WEEKLY" | "BIWEEKLY" | "MONTHLY"

interface Props {
  dayIso: string
  defaultProfessionalId: string
  professionals: ProfessionalLite[]
  /**
   * When true, the assignee picker is shown so the user can choose. When false,
   * `defaultProfessionalId` is used silently. The locked case happens when the
   * agenda already has a specific professional selected — adding a todo there
   * should inherit that selection.
   */
  canPickProfessional: boolean
  onAdd: (args: {
    day: string
    title: string
    professionalProfileId: string
    notes?: string
    recurrenceType?: "WEEKLY" | "BIWEEKLY" | "MONTHLY"
  }) => Promise<void>
}

export function TodoInlineAdd({
  dayIso,
  defaultProfessionalId,
  professionals,
  canPickProfessional,
  onAdd,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [localAssignee, setLocalAssignee] = useState(defaultProfessionalId)
  const [recurrence, setRecurrence] = useState<RecurrenceChoice>("")
  const inputRef = useRef<HTMLInputElement>(null)
  // Ref guard (not state) so synchronous double-fires — sensitive mouse,
  // double Enter, Enter+click — see the lock immediately. State updates
  // batch and would let the second call slip through before the re-render.
  const submittingRef = useRef(false)

  // Derive the effective assignee — when locked, the parent's choice always
  // wins, so we never need to mutate state to "stay in sync".
  const assignee = canPickProfessional ? localAssignee : defaultProfessionalId

  function reset() {
    setTitle("")
    setNotes("")
    setLocalAssignee(defaultProfessionalId)
    setRecurrence("")
    setExpanded(false)
  }

  async function commit() {
    if (submittingRef.current) return
    const t = title.trim()
    if (!t) {
      reset()
      return
    }
    submittingRef.current = true
    try {
      await onAdd({
        day: dayIso,
        title: t,
        professionalProfileId: assignee || defaultProfessionalId,
        notes: notes.trim() || undefined,
        recurrenceType: recurrence || undefined,
      })
      reset()
    } finally {
      submittingRef.current = false
    }
  }

  return (
    <div
      className={`rounded-[8px] border border-dashed border-ink-200 bg-white transition-colors hover:border-brand-400 focus-within:border-brand-500 ${
        expanded ? "p-1.5 flex flex-col gap-1" : "px-1.5 py-1"
      }`}
      onClick={() => {
        if (!expanded) inputRef.current?.focus()
      }}
    >
      <div className="flex items-center gap-1.5">
        <PlusIcon className="w-3 h-3 text-ink-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
            if (e.key === "Escape") reset()
          }}
          placeholder="Adicionar tarefa…"
          className="flex-1 min-w-0 bg-transparent outline-none border-0 text-[12px]! leading-[1.3] py-0.5 placeholder:text-ink-400"
        />
      </div>
      {expanded && (
        <>
          <textarea
            placeholder="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-transparent outline-none border-0 text-[11.5px]! leading-[1.35] resize-none px-0.5 py-0.5 placeholder:text-ink-400"
          />
          <div className="flex flex-wrap gap-1 items-center pt-0.5">
            {canPickProfessional && (
              <select
                value={localAssignee}
                onChange={(e) => setLocalAssignee(e.target.value)}
                className="bg-card border border-ink-200 rounded-[6px] px-1.5 py-[1px] text-[10.5px]! text-ink-700"
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.split(" ")[0]}
                  </option>
                ))}
              </select>
            )}
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as RecurrenceChoice)}
              className="bg-card border border-ink-200 rounded-[6px] px-1.5 py-[1px] text-[10.5px]! text-ink-700"
            >
              <option value="">Sem recorrência</option>
              <option value="WEEKLY">Semanal</option>
              <option value="BIWEEKLY">Quinzenal</option>
              <option value="MONTHLY">Mensal</option>
            </select>
            <button
              onClick={(e) => {
                e.stopPropagation()
                reset()
              }}
              className="px-1.5 py-[1px] text-[10.5px] rounded-[6px] border border-ink-200 bg-card text-ink-700 hover:bg-ink-50"
            >
              Cancelar
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                commit()
              }}
              className="ml-auto px-1.5 py-[1px] text-[10.5px] rounded-[6px] bg-ink-900 text-white"
            >
              Adicionar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
