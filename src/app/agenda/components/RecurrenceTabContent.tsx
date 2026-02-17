"use client"

import { useState, useEffect } from "react"
import { Appointment, RecurrenceType, RecurrenceEndType, Modality, Professional } from "../lib/types"
import { RECURRENCE_TYPE_LABELS, MAX_RECURRENCE_OCCURRENCES } from "../lib/constants"
import { TimeInput } from "./TimeInput"
import { toDateString, calculateEndTime } from "../lib/utils"
import { toast } from "sonner"
import { Dialog } from "./Sheet"

interface RecurrenceTabContentProps {
  appointment: Appointment
  onSave: () => void
  onClose: () => void
  professionals?: Professional[]
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
const FULL_DAY_NAMES = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"]

export function RecurrenceTabContent({ appointment, onSave, onClose, professionals }: RecurrenceTabContentProps) {
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("WEEKLY")
  const [originalRecurrenceType, setOriginalRecurrenceType] = useState<RecurrenceType>("WEEKLY")
  const [startTime, setStartTime] = useState("")
  const [duration, setDuration] = useState(50)
  const [modality, setModality] = useState<Modality>("PRESENCIAL")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("BY_OCCURRENCES")
  const [endDate, setEndDate] = useState("")
  const [occurrences, setOccurrences] = useState(10)
  const [dayOfWeek, setDayOfWeek] = useState<number>(0)
  const [originalDayOfWeek, setOriginalDayOfWeek] = useState<number>(0)
  const [applyToFuture, setApplyToFuture] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [additionalProfIds, setAdditionalProfIds] = useState<string[]>([])

  // Finalize dialog state
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false)
  const [finalizeDate, setFinalizeDate] = useState("")
  const [isFinalizing, setIsFinalizing] = useState(false)

  // Initialize form when appointment changes
  useEffect(() => {
    if (appointment?.recurrence) {
      const recurrence = appointment.recurrence
      setRecurrenceType(recurrence.recurrenceType)
      setOriginalRecurrenceType(recurrence.recurrenceType)
      setRecurrenceEndType(recurrence.recurrenceEndType)
      setModality(appointment.modality as Modality)
      setAdditionalProfIds(
        appointment.additionalProfessionals?.map(ap => ap.professionalProfile.id) || []
      )
      setApplyToFuture(true)

      const scheduledAt = new Date(appointment.scheduledAt)
      const endAt = new Date(appointment.endAt)
      setStartTime(`${String(scheduledAt.getHours()).padStart(2, "0")}:${String(scheduledAt.getMinutes()).padStart(2, "0")}`)
      setDuration(Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000))

      if (recurrence.endDate) {
        const date = new Date(recurrence.endDate)
        setEndDate(toDateString(date))
      } else {
        setEndDate("")
      }
      setOccurrences(recurrence.occurrences || 10)

      // Initialize day of week from recurrence or derive from scheduledAt
      const day = recurrence.dayOfWeek !== undefined ? recurrence.dayOfWeek : scheduledAt.getDay()
      setDayOfWeek(day)
      setOriginalDayOfWeek(day)
    }
  }, [appointment])

  async function handleSave() {
    if (!appointment?.recurrence) return

    setIsSaving(true)

    try {
      const computedEndTime = calculateEndTime(startTime, duration)
      const body: Record<string, unknown> = {
        recurrenceType,
        startTime,
        endTime: computedEndTime || startTime,
        modality,
        recurrenceEndType,
      }

      if (recurrenceEndType === "BY_DATE") {
        body.endDate = endDate || null
      } else if (recurrenceEndType === "BY_OCCURRENCES") {
        body.occurrences = occurrences
      }

      if (dayOfWeek !== originalDayOfWeek) {
        body.dayOfWeek = dayOfWeek
      }

      body.additionalProfessionalIds = additionalProfIds

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
        if (result.code === "DAY_CHANGE_CONFLICTS" && result.conflicts) {
          const conflictDates = result.conflicts.map((c: { date: string; conflictsWith: string }) =>
            `${c.date} (conflito com ${c.conflictsWith})`
          ).join(", ")
          toast.error(`Conflitos encontrados: ${conflictDates}`)
        } else {
          toast.error(result.error || "Erro ao atualizar recorrencia")
        }
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

    // Validate date format (YYYY-MM-DD from native date picker)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalizeDate)) {
      toast.error("Data invalida")
      return
    }

    setIsFinalizing(true)

    try {
      const response = await fetch(
        `/api/appointments/recurrences/${appointment.recurrence.id}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endDate: finalizeDate,
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
      <div className="space-y-5">
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
          {recurrenceType !== originalRecurrenceType && (
            <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Mudando de {RECURRENCE_TYPE_LABELS[originalRecurrenceType]} para {RECURRENCE_TYPE_LABELS[recurrenceType]}.
                Agendamentos que nao se encaixam na nova frequencia serao removidos.
              </p>
            </div>
          )}
        </div>

        {/* Day of Week */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Dia da semana
          </label>
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setDayOfWeek(index)}
                className={`h-10 px-1 rounded-md text-sm font-medium border transition-colors ${
                  dayOfWeek === index
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {dayOfWeek !== originalDayOfWeek && (
            <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Mudando de {FULL_DAY_NAMES[originalDayOfWeek]} para {FULL_DAY_NAMES[dayOfWeek]}.
                Todos os agendamentos futuros serao movidos para o novo dia.
              </p>
            </div>
          )}
        </div>

        {/* Time + Duration + End Time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="recStartTime" className="block text-sm font-medium text-foreground mb-1.5">
              Inicio
            </label>
            <TimeInput
              id="recStartTime"
              placeholder="HH:MM"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
          </div>
          <div>
            <label htmlFor="recDuration" className="block text-sm font-medium text-foreground mb-1.5">
              Duracao
            </label>
            <input
              id="recDuration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(Math.max(5, parseInt(e.target.value) || 5))}
              min={5}
              max={480}
              step={5}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Fim
            </label>
            <div className="h-11 px-3.5 rounded-xl border border-input bg-muted/50 text-foreground text-sm flex items-center">
              {calculateEndTime(startTime, duration) || "—"}
            </div>
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

        {/* Additional professionals */}
        {professionals && professionals.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Profissionais adicionais
            </label>
            <div className="space-y-2 p-3 rounded-xl border border-input bg-background">
              {professionals
                .filter(p => {
                  const profId = p.professionalProfile?.id
                  return profId && profId !== appointment.professionalProfile.id
                })
                .map(prof => (
                  <label key={prof.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={additionalProfIds.includes(prof.professionalProfile!.id)}
                      onChange={(e) => {
                        const id = prof.professionalProfile!.id
                        if (e.target.checked) {
                          setAdditionalProfIds([...additionalProfIds, id])
                        } else {
                          setAdditionalProfIds(additionalProfIds.filter(x => x !== id))
                        }
                      }}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-ring/40"
                    />
                    <span className="text-sm">{prof.name}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

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
            <label htmlFor="recOccurrences" className="block text-sm font-medium text-foreground mb-2">
              Numero de sessoes
            </label>
            <input
              id="recOccurrences"
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
            <label htmlFor="recEndDate" className="block text-sm font-medium text-foreground mb-2">
              Data final
            </label>
            <input
              id="recEndDate"
              type="date"
              value={endDate || ""}
              onChange={(e) => setEndDate(e.target.value)}
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
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-colors"
          >
            Fechar
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
