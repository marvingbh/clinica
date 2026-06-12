"use client"

import { useState } from "react"
import {
  PhoneIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
  SendIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@/shared/components/ui/icons"
import { professionalLabel } from "@/lib/waitlist"
import type { SerializedWaitlistEntry } from "../types"

interface Props {
  entry: SerializedWaitlistEntry
  index: number
  total: number
  reorderable: boolean
  onEdit: (entry: SerializedWaitlistEntry) => void
  onArchive: (entry: SerializedWaitlistEntry) => void
  onMove: (entry: SerializedWaitlistEntry, direction: "up" | "down") => void
}

function waitLabel(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return "hoje"
  return `há ${days} dia${days === 1 ? "" : "s"}`
}

export function WaitlistEntryRow({
  entry,
  index,
  total,
  reorderable,
  onEdit,
  onArchive,
  onMove,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      {reorderable && (
        <div className="flex flex-col items-center pt-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(entry, "up")}
            className="w-6 h-6 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30 flex items-center justify-center"
            aria-label="Subir prioridade"
          >
            <ChevronUpIcon className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-ink-400">{index + 1}</span>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(entry, "down")}
            className="w-6 h-6 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30 flex items-center justify-center"
            aria-label="Descer prioridade"
          >
            <ChevronDownIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-[14px] text-ink-900 truncate">{entry.name}</p>
          {entry.isLead && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              Lead
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[12px] text-ink-500">
          {entry.phone && (
            <span className="inline-flex items-center gap-1 font-mono">
              <PhoneIcon className="w-3 h-3" /> {entry.phone}
            </span>
          )}
          <span>{professionalLabel(entry.professionalName)}</span>
        </div>
        <p className="text-[12px] text-ink-500 mt-0.5">{entry.preferencesSummary}</p>
        {entry.priorityNote && (
          <p className="text-[12px] text-ink-600 italic mt-0.5">“{entry.priorityNote}”</p>
        )}
        {entry.removedReason && (
          <p className="text-[12px] text-ink-500 mt-0.5">Motivo: {entry.removedReason}</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] text-ink-400">{waitLabel(entry.createdAt)}</span>
        {(entry.status === "ATIVA" || entry.status === "OFERTADA") && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-8 h-8 rounded text-ink-500 hover:bg-ink-100 flex items-center justify-center"
              aria-label="Ações"
            >
              <MoreHorizontalIcon className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-ink-200 bg-card shadow-lg py-1">
                  <MenuItem
                    icon={<PencilIcon className="w-4 h-4" />}
                    label="Editar"
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit(entry)
                    }}
                  />
                  {entry.status === "ATIVA" && !entry.isLead && (
                    <MenuItem
                      icon={<SendIcon className="w-4 h-4" />}
                      label="Enviar oferta manual"
                      onClick={() => {
                        setMenuOpen(false)
                        onEdit(entry)
                      }}
                      hint="Use a agenda para escolher o horário"
                    />
                  )}
                  <MenuItem
                    icon={<TrashIcon className="w-4 h-4" />}
                    label="Remover"
                    destructive
                    onClick={() => {
                      setMenuOpen(false)
                      onArchive(entry)
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
  hint,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-ink-50 ${
        destructive ? "text-destructive" : "text-ink-700"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
