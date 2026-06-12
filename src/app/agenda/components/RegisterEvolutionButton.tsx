"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileText } from "lucide-react"
import { usePermission } from "@/shared/hooks"

interface RegisterEvolutionButtonProps {
  appointmentId: string
  patientId: string
  /** Appointment type — only CONSULTA offers the action. */
  type: string
}

/**
 * "Registrar evolução" / "Ver evolução" action shown on a CONSULTA detail.
 * Creates a draft note linked to the appointment; on a uniqueness conflict
 * (note already exists) navigates to the existing note.
 */
export function RegisterEvolutionButton({ appointmentId, patientId, type }: RegisterEvolutionButtonProps) {
  const router = useRouter()
  const { canWrite } = usePermission("prontuario")
  const [busy, setBusy] = useState(false)

  if (type !== "CONSULTA" || !patientId || !canWrite) return null

  async function open() {
    setBusy(true)
    try {
      const res = await fetch("/api/prontuario/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, appointmentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.existingNoteId) {
        router.push(`/prontuario/${data.existingNoteId}`)
        return
      }
      if (res.status === 422) {
        toast.error(data.error ?? "Não foi possível registrar a evolução.")
        return
      }
      if (!res.ok) throw new Error()
      router.push(`/prontuario/${data.note.id}`)
    } catch {
      toast.error("Erro ao abrir a evolução.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-60"
    >
      <FileText className="h-3.5 w-3.5" /> Registrar evolução
    </button>
  )
}
