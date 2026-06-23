"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatSessionDateTime } from "./labels"

interface PendingItem {
  appointmentId: string
  patientId: string
  patientName: string | null
  scheduledAt: string
}

interface PendingNotesListProps {
  pending: PendingItem[]
  /** Only the treating professional can author a note; admins view read-only. */
  canRegister?: boolean
}

export function PendingNotesList({ pending, canRegister = true }: PendingNotesListProps) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function register(item: PendingItem) {
    setBusyId(item.appointmentId)
    try {
      const res = await fetch("/api/prontuario/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: item.patientId, appointmentId: item.appointmentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.existingNoteId) {
        router.push(`/prontuario/${data.existingNoteId}`)
        return
      }
      if (!res.ok) throw new Error(data.error || "Não foi possível abrir a evolução.")
      router.push(`/prontuario/${data.note.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a evolução.")
    } finally {
      setBusyId(null)
    }
  }

  if (pending.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma evolução pendente.</p>
  }

  return (
    <div className="space-y-3">
      {pending.map((item) => (
        <div
          key={item.appointmentId}
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{item.patientName ?? "Paciente"}</p>
            <p className="text-xs text-muted-foreground">{formatSessionDateTime(item.scheduledAt)}</p>
          </div>
          {canRegister ? (
            <button
              type="button"
              onClick={() => register(item)}
              disabled={busyId === item.appointmentId}
              className="h-9 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Registrar evolução
            </button>
          ) : (
            <span className="whitespace-nowrap text-xs italic text-muted-foreground">
              Só o profissional responsável registra
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
