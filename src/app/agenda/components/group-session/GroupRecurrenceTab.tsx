"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog } from "../Sheet"
import { DateInput } from "../DateInput"
import type { GroupSession } from "./types"

const RECURRENCE_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
}

interface GroupRecurrenceTabProps {
  session: GroupSession
  onSaved: () => void
}

function toDisplayDateFromDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0")
  const m = String(date.getMonth() + 1).padStart(2, "0")
  return `${d}/${m}/${date.getFullYear()}`
}

function toIsoDate(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return display
  return `${match[3]}-${match[2]}-${match[1]}`
}

export function GroupRecurrenceTab({ session, onSaved }: GroupRecurrenceTabProps) {
  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false)
  const [finalizeDate, setFinalizeDate] = useState("")
  const [isFinalizing, setIsFinalizing] = useState(false)

  if (!session.groupId) return null

  const handleFinalize = async () => {
    if (!finalizeDate) return
    const isoDate = toIsoDate(finalizeDate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      toast.error("Data inválida")
      return
    }

    setIsFinalizing(true)
    try {
      // 1. Deactivate the group
      const patchRes = await fetch(`/api/groups/${session.groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json()
        throw new Error(err.error || "Erro ao desativar grupo")
      }

      // 2. Delete future appointments after the end date
      const endDate = new Date(isoDate + "T23:59:59.999")
      const deleteRes = await fetch(`/api/groups/${session.groupId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: isoDate }),
      })
      if (!deleteRes.ok) {
        const err = await deleteRes.json()
        throw new Error(err.error || "Erro ao remover sessões futuras")
      }

      const data = await deleteRes.json()
      toast.success(`Recorrência finalizada. ${data.deletedCount} sessão(ões) removida(s).`)
      setIsFinalizeOpen(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar recorrência")
    } finally {
      setIsFinalizing(false)
    }
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Current recurrence info */}
      <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Frequência</span>
          <span className="text-sm font-medium text-foreground">
            {RECURRENCE_LABELS[session.recurrenceType || ""] || session.recurrenceType || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <span className={`text-sm font-medium ${session.isActive ? "text-green-600" : "text-red-500"}`}>
            {session.isActive ? "Ativo" : "Inativo"}
          </span>
        </div>
      </div>

      {/* Finalize button */}
      {session.isActive && (
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => {
              setFinalizeDate(toDisplayDateFromDate(new Date()))
              setIsFinalizeOpen(true)
            }}
            className="w-full h-11 rounded-xl border border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 font-medium hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
          >
            Finalizar recorrência
          </button>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            Define uma data de fim e remove sessões futuras do grupo.
          </p>
        </div>
      )}

      <Dialog isOpen={isFinalizeOpen} onClose={() => setIsFinalizeOpen(false)} title="Finalizar Recorrência">
        <p className="text-sm text-muted-foreground mb-4">
          Defina a data final. Sessões após essa data serão removidas e o grupo será desativado.
        </p>
        <div className="mb-6">
          <label htmlFor="groupFinalizeDate" className="block text-sm font-medium text-foreground mb-2">
            Data final
          </label>
          <DateInput
            id="groupFinalizeDate"
            value={finalizeDate}
            onChange={(e) => setFinalizeDate(e.target.value)}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setIsFinalizeOpen(false)}
            disabled={isFinalizing}
            className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={isFinalizing || !finalizeDate}
            className="flex-1 h-11 rounded-xl bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            {isFinalizing ? "Finalizando..." : "Finalizar"}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
