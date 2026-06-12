"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog } from "@/app/agenda/components/Sheet"
import type { SerializedWaitlistEntry } from "../types"

interface Props {
  entry: SerializedWaitlistEntry | null
  onClose: () => void
  onArchived: () => void
}

/** Confirmation dialog with a required removal reason. */
export function ArchiveEntryDialog({ entry, onClose, onArchived }: Props) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  if (!entry) return null

  async function handleArchive() {
    if (!entry) return
    if (!reason.trim()) {
      toast.error("Informe o motivo da remoção")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/waitlist/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REMOVIDA", removedReason: reason.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Falha ao remover")
      }
      toast.success("Entrada removida")
      onArchived()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog isOpen={!!entry} onClose={onClose} title="Remover da lista de espera">
      <div className="space-y-4">
        <p className="text-[13px] text-ink-700">
          Remover <strong>{entry.name}</strong> da lista de espera?
        </p>
        <div>
          <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
            Motivo da remoção *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ex.: já agendado, desistiu, contato perdido..."
            className="w-full px-2 py-2 rounded-md border border-ink-300 bg-card text-[13px]"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-10 rounded-md border border-ink-300 text-[13px] text-ink-700 hover:bg-ink-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={saving}
            className="px-4 h-10 rounded-md bg-destructive text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Removendo..." : "Remover"}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
