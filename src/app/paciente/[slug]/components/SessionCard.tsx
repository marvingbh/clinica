"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CalendarDays, Clock, User } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { usePortal } from "./PortalSessionProvider"
import { RescheduleDialog } from "./RescheduleDialog"
import {
  formatDateTime,
  modalityLabel,
  statusLabel,
  type PortalAppointmentView,
} from "./format"

interface SessionCardProps {
  appointment: PortalAppointmentView
  onChanged: () => void
}

export function SessionCard({ appointment, onChanged }: SessionCardProps) {
  const { slug, me } = usePortal()
  const [busy, setBusy] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const { date, time } = formatDateTime(appointment.scheduledAt)
  const readOnly = me?.access === "read_only"
  const canAct = appointment.status === "AGENDADO" || appointment.status === "CONFIRMADO"

  async function act(path: string, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/public/portal/${slug}/appointments/${appointment.id}/${path}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível concluir a ação.")
        return
      }
      toast.success(successMsg)
      onChanged()
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {modalityLabel(appointment.modality)}
        </span>
        <span className="text-xs font-medium text-foreground">{statusLabel(appointment.status)}</span>
      </div>
      <div className="space-y-1 text-sm text-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" /> {date}
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" /> {time}
        </div>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" /> {appointment.professionalName}
        </div>
      </div>

      {canAct && !readOnly && (
        <div className="flex flex-wrap gap-2 pt-1">
          {appointment.status === "AGENDADO" && (
            <Button size="sm" disabled={busy} onClick={() => act("confirm", "Presença confirmada!")}>
              Confirmar presença
            </Button>
          )}
          <Button
            size="sm"
            variant="outlined"
            disabled={busy}
            onClick={() => act("cancel", "Sessão cancelada. A clínica foi avisada.")}
          >
            Cancelar
          </Button>
          <Button size="sm" variant="text" disabled={busy} onClick={() => setShowReschedule(true)}>
            Solicitar reagendamento
          </Button>
        </div>
      )}

      {showReschedule && (
        <RescheduleDialog
          appointmentId={appointment.id}
          onClose={() => setShowReschedule(false)}
          onSubmitted={() => {
            setShowReschedule(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}
