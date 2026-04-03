"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog } from "../Sheet"
import { DateInput } from "../DateInput"
import { TimeInput } from "../TimeInput"
import type { GroupSession } from "./types"

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const RECURRENCE_OPTIONS = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
  { value: "MONTHLY", label: "Mensal" },
] as const

interface GroupRecurrenceTabProps {
  session: GroupSession
  onSaved: () => void
  onClose: () => void
}

function toDisplayDateFromDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
}

function toIsoDate(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : display
}

function calculateEndTime(start: string, dur: number): string {
  if (!start || !dur) return ""
  const [h, m] = start.split(":").map(Number)
  const totalMin = h * 60 + m + dur
  return `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`
}

export function GroupRecurrenceTab({ session, onSaved, onClose }: GroupRecurrenceTabProps) {
  const sessionDate = new Date(session.scheduledAt)
  const fallbackDay = sessionDate.getDay()
  const fallbackTime = `${String(sessionDate.getHours()).padStart(2, "0")}:${String(sessionDate.getMinutes()).padStart(2, "0")}`
  const fallbackDuration = Math.round((new Date(session.endAt).getTime() - sessionDate.getTime()) / 60000)

  const [recurrenceType, setRecurrenceType] = useState(session.recurrenceType || "WEEKLY")
  const [dayOfWeek, setDayOfWeek] = useState(session.dayOfWeek ?? fallbackDay)
  const [startTime, setStartTime] = useState(session.startTime || fallbackTime)
  const [duration, setDuration] = useState(session.duration || fallbackDuration || 60)
  const [isSaving, setIsSaving] = useState(false)
  const [isScopeDialogOpen, setIsScopeDialogOpen] = useState(false)

  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false)
  const [finalizeDate, setFinalizeDate] = useState("")
  const [isFinalizing, setIsFinalizing] = useState(false)

  if (!session.groupId) return null

  const endTime = calculateEndTime(startTime, duration)

  const handleSaveClick = () => setIsScopeDialogOpen(true)

  const handleSaveThisOnly = async () => {
    setIsScopeDialogOpen(false)
    setIsSaving(true)
    try {
      const currentDay = sessionDate.getDay()
      const dayDiff = dayOfWeek - currentDay
      const newDate = new Date(sessionDate)
      newDate.setDate(newDate.getDate() + dayDiff)
      const [h, m] = startTime.split(":").map(Number)
      newDate.setHours(h, m, 0, 0)
      const newEnd = new Date(newDate.getTime() + duration * 60000)

      const res = await fetch("/api/group-sessions/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: session.groupId,
          scheduledAt: session.scheduledAt,
          newScheduledAt: newDate.toISOString(),
          newEndAt: newEnd.toISOString(),
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success("Esta sessão foi atualizada")
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAllFuture = async () => {
    setIsScopeDialogOpen(false)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/groups/${session.groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recurrenceType, dayOfWeek, startTime, duration, applyTo: "future" }),
      })
      const result = await res.json()
      if (!res.ok) { toast.error(result.error || "Erro ao atualizar"); return }
      toast.success(result.message || "Recorrência atualizada")
      onSaved()
      onClose()
    } catch {
      toast.error("Erro ao atualizar recorrência")
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!finalizeDate) return
    const isoDate = toIsoDate(finalizeDate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) { toast.error("Data inválida"); return }

    setIsFinalizing(true)
    try {
      const res = await fetch(`/api/groups/${session.groupId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: isoDate }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      const data = await res.json()
      toast.success(`Recorrência finalizada. ${data.deletedCount} sessão(ões) removida(s).`)
      setIsFinalizeOpen(false)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar")
    } finally {
      setIsFinalizing(false)
    }
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Frequência</label>
        <div className="grid grid-cols-3 gap-2">
          {RECURRENCE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setRecurrenceType(value)}
              className={`h-10 rounded-xl border text-sm font-medium transition-colors ${
                recurrenceType === value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Day of Week */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Dia da semana</label>
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((label, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setDayOfWeek(index)}
              className={`h-10 rounded-xl text-xs font-medium transition-colors ${
                dayOfWeek === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Time + Duration */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Início</label>
          <TimeInput
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="HH:MM"
            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Duração</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={15} max={480} step={5}
            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Fim</label>
          <div className="h-10 px-3 rounded-xl border border-input bg-muted/30 flex items-center text-sm text-muted-foreground">
            {endTime || "—"}
          </div>
        </div>
      </div>

      {/* Finalize */}
      {session.isActive && (
        <div className="pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => { setFinalizeDate(toDisplayDateFromDate(new Date())); setIsFinalizeOpen(true) }}
            className="w-full h-11 rounded-xl border border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 font-medium hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
          >
            Finalizar recorrência
          </button>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            Define uma data de fim e remove sessões futuras do grupo.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="flex-1 h-12 rounded-xl border border-input bg-background text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={isSaving}
          className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>

      {/* Scope Dialog */}
      <Dialog isOpen={isScopeDialogOpen} onClose={() => setIsScopeDialogOpen(false)} title="Aplicar alterações">
        <p className="text-sm text-muted-foreground mb-4">
          Deseja alterar apenas esta sessão ou todas as sessões futuras?
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSaveThisOnly}
            disabled={isSaving}
            className="w-full h-12 px-4 rounded-xl border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors text-left disabled:opacity-50"
          >
            <span className="font-semibold">Apenas esta sessão</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Altera horário/dia somente nesta data</span>
          </button>
          <button
            type="button"
            onClick={handleSaveAllFuture}
            disabled={isSaving}
            className="w-full h-12 px-4 rounded-xl border border-primary/30 bg-primary/5 text-foreground text-sm font-medium hover:bg-primary/10 transition-colors text-left disabled:opacity-50"
          >
            <span className="font-semibold">Esta e todas as futuras</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Atualiza a recorrência e move sessões futuras</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsScopeDialogOpen(false)}
          className="w-full h-10 mt-3 rounded-xl border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
      </Dialog>

      {/* Finalize Dialog */}
      <Dialog isOpen={isFinalizeOpen} onClose={() => setIsFinalizeOpen(false)} title="Finalizar Recorrência">
        <p className="text-sm text-muted-foreground mb-4">
          Sessões após essa data serão removidas e o grupo será desativado.
        </p>
        <div className="mb-6">
          <label htmlFor="groupFinalizeDate" className="block text-sm font-medium text-foreground mb-2">Data final</label>
          <DateInput
            id="groupFinalizeDate"
            value={finalizeDate}
            onChange={(e) => setFinalizeDate(e.target.value)}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setIsFinalizeOpen(false)} disabled={isFinalizing} className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={handleFinalize} disabled={isFinalizing || !finalizeDate} className="flex-1 h-11 rounded-xl bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors disabled:opacity-50">
            {isFinalizing ? "Finalizando..." : "Finalizar"}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
