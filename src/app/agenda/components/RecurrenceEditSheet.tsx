"use client"

import { useState, useEffect } from "react"
import { Sheet, Dialog } from "./Sheet"
import { Appointment, RecurrenceType, RecurrenceEndType, Modality } from "../lib/types"
import { RECURRENCE_TYPE_LABELS, MAX_RECURRENCE_OCCURRENCES } from "../lib/constants"
import { toDateString } from "../lib/utils"
import { toast } from "sonner"

interface RecurrenceEditSheetProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onSave: () => void
}

export function RecurrenceEditSheet({ isOpen, onClose, appointment, onSave }: RecurrenceEditSheetProps) {
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("WEEKLY")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [modality, setModality] = useState<Modality>("PRESENCIAL")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("BY_OCCURRENCES")
  const [endDate, setEndDate] = useState("")
  const [occurrences, setOccurrences] = useState(10)
  const [applyToFuture, setApplyToFuture] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Finalize dialog state
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false)
  const [finalizeDate, setFinalizeDate] = useState("")
  const [isFinalizing, setIsFinalizing] = useState(false)

  // Initialize form when appointment changes
  useEffect(() => {
    if (appointment?.recurrence) {
      const recurrence = appointment.recurrence
      setRecurrenceType(recurrence.recurrenceType)
      setRecurrenceEndType(recurrence.recurrenceEndType)
      setModality(appointment.modality as Modality)
      setApplyToFuture(true)

      const scheduledAt = new Date(appointment.scheduledAt)
      const endAt = new Date(appointment.endAt)
      setStartTime(`${String(scheduledAt.getHours()).padStart(2, "0")}:${String(scheduledAt.getMinutes()).padStart(2, "0")}`)
      setEndTime(`${String(endAt.getHours()).padStart(2, "0")}:${String(endAt.getMinutes()).padStart(2, "0")}`)

      if (recurrence.endDate) {
        setEndDate(new Date(recurrence.endDate).toISOString().split("T")[0])
      } else {
        setEndDate("")
      }
      setOccurrences(recurrence.occurrences || 10)
    }
  }, [appointment])

  async function handleSave() {
    if (!appointment?.recurrence) return

    setIsSaving(true)

    try {
      const body: Record<string, unknown> = {
        recurrenceType,
        startTime,
        endTime,
        modality,
        recurrenceEndType,
      }

      if (recurrenceEndType === "BY_DATE") {
        body.endDate = endDate || null
      } else if (recurrenceEndType === "BY_OCCURRENCES") {
        body.occurrences = occurrences
      }

      if (applyToFuture) {
        body.applyTo = "future"
      }

      const response = await fetch(
        `/api/appointments/recurrences/${appointment.recurrence.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao atualizar recorrencia")
        return
      }

      toast.success(result.message || "Recorrencia atualizada com sucesso")
      onSave()
      onClose()
    } catch {
      toast.error("Erro ao atualizar recorrencia")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleFinalize() {
    if (!appointment?.recurrence || !finalizeDate) return

    setIsFinalizing(true)

    try {
      const response = await fetch(
        `/api/appointments/recurrences/${appointment.recurrence.id}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endDate: finalizeDate,
            cancelFutureAppointments: false,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao finalizar recorrencia")
        return
      }

      toast.success(result.message || "Recorrencia finalizada com sucesso")
      setIsFinalizeDialogOpen(false)
      onSave()
      onClose()
    } catch {
      toast.error("Erro ao finalizar recorrencia")
    } finally {
      setIsFinalizing(false)
    }
  }

  if (!appointment?.recurrence) return null

  const isIndefinite = appointment.recurrence.recurrenceEndType === "INDEFINITE"

  return (
    <>
      <Sheet isOpen={isOpen} onClose={onClose} title="Editar Recorrencia">
        <div className="p-4 space-y-6">
          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Frequencia
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(RECURRENCE_TYPE_LABELS) as RecurrenceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRecurrenceType(type)}
                  className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
                    recurrenceType === type
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {RECURRENCE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="editRecStartTime" className="block text-sm font-medium text-foreground mb-2">
                Inicio
              </label>
              <input
                id="editRecStartTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label htmlFor="editRecEndTime" className="block text-sm font-medium text-foreground mb-2">
                Fim
              </label>
              <input
                id="editRecEndTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
          </div>

          {/* Modality */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Modalidade
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModality("PRESENCIAL")}
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
                  modality === "PRESENCIAL"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Presencial
              </button>
              <button
                type="button"
                onClick={() => setModality("ONLINE")}
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
                  modality === "ONLINE"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Online
              </button>
            </div>
          </div>

          {/* End Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Terminar
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRecurrenceEndType("BY_OCCURRENCES")}
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
                  recurrenceEndType === "BY_OCCURRENCES"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Apos N sessoes
              </button>
              <button
                type="button"
                onClick={() => setRecurrenceEndType("BY_DATE")}
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
                  recurrenceEndType === "BY_DATE"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Em uma data
              </button>
              <button
                type="button"
                onClick={() => setRecurrenceEndType("INDEFINITE")}
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
                  recurrenceEndType === "INDEFINITE"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Sem fim
              </button>
            </div>
          </div>

          {/* Occurrences Input */}
          {recurrenceEndType === "BY_OCCURRENCES" && (
            <div>
              <label htmlFor="editOccurrences" className="block text-sm font-medium text-foreground mb-2">
                Numero de sessoes
              </label>
              <input
                id="editOccurrences"
                type="number"
                value={occurrences}
                onChange={(e) => setOccurrences(Math.min(MAX_RECURRENCE_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)))}
                min={1}
                max={MAX_RECURRENCE_OCCURRENCES}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
          )}

          {/* End Date Input */}
          {recurrenceEndType === "BY_DATE" && (
            <div>
              <label htmlFor="editRecEndDate" className="block text-sm font-medium text-foreground mb-2">
                Data final
              </label>
              <input
                id="editRecEndDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={toDateString(new Date())}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
          )}

          {/* Indefinite Info */}
          {recurrenceEndType === "INDEFINITE" && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Os agendamentos serao criados automaticamente e estendidos semanalmente.
              </p>
            </div>
          )}

          {/* Apply to future option */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToFuture}
                onChange={(e) => setApplyToFuture(e.target.checked)}
                className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
              />
              <span className="text-sm text-foreground">
                Aplicar alteracoes aos agendamentos futuros
              </span>
            </label>
            <p className="text-xs text-muted-foreground mt-1 ml-8">
              Se marcado, o horario e modalidade serao atualizados nos proximos agendamentos.
            </p>
          </div>

          {/* Finalize button for INDEFINITE recurrences */}
          {isIndefinite && (
            <div className="pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setFinalizeDate(toDateString(new Date()))
                  setIsFinalizeDialogOpen(true)
                }}
                className="w-full h-11 rounded-md border border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 font-medium hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
              >
                Finalizar recorrencia
              </button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Define uma data de fim para parar de gerar novos agendamentos.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 pb-8">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-opacity"
            >
              {isSaving ? "Salvando..." : "Salvar Alteracoes"}
            </button>
          </div>
        </div>
      </Sheet>

      {/* Finalize Dialog */}
      <Dialog
        isOpen={isFinalizeDialogOpen}
        onClose={() => setIsFinalizeDialogOpen(false)}
        title="Finalizar Recorrencia"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Defina a data final para esta recorrencia. Apos essa data, nao serao gerados novos agendamentos automaticamente.
        </p>

        <div className="mb-6">
          <label htmlFor="finalizeDate" className="block text-sm font-medium text-foreground mb-2">
            Data final
          </label>
          <input
            id="finalizeDate"
            type="date"
            value={finalizeDate}
            onChange={(e) => setFinalizeDate(e.target.value)}
            min={toDateString(new Date())}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setIsFinalizeDialogOpen(false)}
            disabled={isFinalizing}
            className="flex-1 h-11 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={isFinalizing || !finalizeDate}
            className="flex-1 h-11 rounded-md bg-orange-600 text-white font-medium hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isFinalizing ? "Finalizando..." : "Finalizar"}
          </button>
        </div>
      </Dialog>
    </>
  )
}
