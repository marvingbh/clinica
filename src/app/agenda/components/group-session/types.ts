import type { CancelVariant } from "@/lib/appointments/status-transitions"
import type { GroupSession, AppointmentStatus, Professional } from "../../lib/types"

export type { GroupSession, AppointmentStatus, Professional, CancelVariant }

export const PARTICIPANT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  FINALIZADO: "Compareceu",
  CANCELADO_ACORDADO: "Desmarcou",
  CANCELADO_FALTA: "Faltou",
  CANCELADO_PROFISSIONAL: "Sem cobrança",
}

export interface CancelContext {
  variant: CancelVariant
  isBulk: boolean
  appointmentId?: string
  patientName?: string
}

export function formatDateTime(isoString: string): { date: string; time: string } {
  const dateObj = new Date(isoString)
  return {
    date: dateObj.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    time: dateObj.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const end = new Date(endIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${start} - ${end}`
}
