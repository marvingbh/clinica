"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FileText } from "lucide-react"
import { usePermission } from "@/shared/hooks"

interface GroupEvolutionActionProps {
  appointmentIds: string[]
}

/**
 * "Registrar evoluções do grupo" — bulk-creates a draft per group member
 * appointment (skipping members that already have a note).
 */
export function GroupEvolutionAction({ appointmentIds }: GroupEvolutionActionProps) {
  const { canWrite } = usePermission("prontuario")
  const [busy, setBusy] = useState(false)

  if (!canWrite || appointmentIds.length === 0) return null

  async function run() {
    setBusy(true)
    try {
      const res = await fetch("/api/prontuario/notes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error()
      const created = data.created?.length ?? 0
      const skipped = data.skipped?.length ?? 0
      toast.success(
        `${created} ${created === 1 ? "rascunho criado" : "rascunhos criados"}` +
          (skipped > 0 ? ` · ${skipped} já existiam` : "")
      )
    } catch {
      toast.error("Não foi possível registrar as evoluções do grupo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 pt-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        <FileText className="h-3.5 w-3.5" /> Registrar evoluções do grupo
      </button>
    </div>
  )
}
