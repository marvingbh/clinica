"use client"

import { Dialog } from "./Sheet"
import type { RecurrenceMoveRequest } from "../hooks/useAppointmentDrag"
import { formatTimeFromMinutes } from "../lib/grid-geometry"

interface RecurrenceMoveDialogProps {
  request: RecurrenceMoveRequest | null
  onMoveThis: () => Promise<void>
  onMoveAllFuture: () => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

export function RecurrenceMoveDialog({
  request,
  onMoveThis,
  onMoveAllFuture,
  onCancel,
  isSubmitting,
}: RecurrenceMoveDialogProps) {
  if (!request) return null

  const { appointment, newTime } = request
  const newStart = new Date(newTime.scheduledAt)
  const newTimeStr = formatTimeFromMinutes(newStart.getHours() * 60 + newStart.getMinutes())

  const oldStart = new Date(appointment.scheduledAt)
  const oldTimeStr = formatTimeFromMinutes(oldStart.getHours() * 60 + oldStart.getMinutes())

  const patientName = appointment.patient?.name || appointment.title || "Agendamento"

  const recurrenceLabel = appointment.recurrence?.recurrenceType === "WEEKLY"
    ? "semanal"
    : appointment.recurrence?.recurrenceType === "BIWEEKLY"
      ? "quinzenal"
      : "mensal"

  return (
    <Dialog
      isOpen={true}
      onClose={onCancel}
      title="Mover agendamento recorrente"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{patientName}</span> tem uma
          recorrência {recurrenceLabel}. Como deseja aplicar a alteração?
        </p>

        <div className="text-sm bg-muted/50 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">{oldTimeStr}</span>
          <span className="mx-2">→</span>
          <span className="font-medium text-foreground">{newTimeStr}</span>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onMoveThis}
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Movendo..." : "Mover apenas este agendamento"}
          </button>
          <button
            type="button"
            onClick={onMoveAllFuture}
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Movendo..." : "Mover este e todos os futuros"}
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>
    </Dialog>
  )
}
