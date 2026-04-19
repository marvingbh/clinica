import { AppointmentStatus, CalendarEntryType } from "./types"

export const CANCELLED_STATUSES: AppointmentStatus[] = [
  "CANCELADO_ACORDADO",
  "CANCELADO_FALTA",
  "CANCELADO_PROFISSIONAL",
]

export const TERMINAL_STATUSES: AppointmentStatus[] = [
  ...CANCELLED_STATUSES,
  "FINALIZADO",
]

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CANCELADO_ACORDADO: "Desmarcou",
  CANCELADO_FALTA: "Cancelado (Falta)",
  CANCELADO_PROFISSIONAL: "Cancelado (sem cobrança)",
  FINALIZADO: "Finalizado",
}

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  AGENDADO: "bg-blue-100 text-blue-800 border-blue-200",
  CONFIRMADO: "bg-green-100 text-green-800 border-green-200",
  CANCELADO_ACORDADO: "bg-red-100 text-red-800 border-red-200",
  CANCELADO_FALTA: "bg-yellow-100 text-yellow-800 border-yellow-200",
  CANCELADO_PROFISSIONAL: "bg-red-100 text-red-800 border-red-200",
  FINALIZADO: "bg-gray-100 text-gray-800 border-gray-200",
}

export const STATUS_BORDER_COLORS: Record<AppointmentStatus, string> = {
  AGENDADO: "border-l-blue-500",
  CONFIRMADO: "border-l-green-500",
  CANCELADO_ACORDADO: "border-l-red-500",
  CANCELADO_FALTA: "border-l-yellow-500",
  CANCELADO_PROFISSIONAL: "border-l-red-500",
  FINALIZADO: "border-l-gray-500",
}

export const RECURRENCE_TYPE_LABELS = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
} as const

export const MODALITY_LABELS = {
  ONLINE: "Online",
  PRESENCIAL: "Presencial",
} as const

export const MAX_RECURRENCE_OCCURRENCES = 52
export const DEFAULT_APPOINTMENT_DURATION = 50

// ============================================================================
// Calendar Entry Type Constants
// ============================================================================

export const ENTRY_TYPE_LABELS: Record<CalendarEntryType, string> = {
  CONSULTA: "Consulta",
  TAREFA: "Tarefa",
  LEMBRETE: "Lembrete",
  NOTA: "Nota",
  REUNIAO: "Reuniao",
}

export const ENTRY_TYPE_COLORS: Record<CalendarEntryType, {
  bg: string
  border: string
  borderLeft: string
  text: string
  accent: string
}> = {
  CONSULTA: {
    bg: "bg-white",
    border: "border-blue-200",
    borderLeft: "border-l-blue-500",
    text: "text-blue-700",
    accent: "bg-blue-500",
  },
  TAREFA: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    borderLeft: "border-l-amber-500",
    text: "text-amber-700",
    accent: "bg-amber-500",
  },
  LEMBRETE: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    borderLeft: "border-l-sky-500",
    text: "text-sky-700",
    accent: "bg-sky-500",
  },
  NOTA: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    borderLeft: "border-l-slate-500",
    text: "text-slate-700",
    accent: "bg-slate-500",
  },
  REUNIAO: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    borderLeft: "border-l-violet-500",
    text: "text-violet-700",
    accent: "bg-violet-500",
  },
}


export const TIME_BLOCKING_TYPES: CalendarEntryType[] = ["CONSULTA", "TAREFA", "REUNIAO"]
export const NON_BLOCKING_TYPES: CalendarEntryType[] = ["LEMBRETE", "NOTA"]

// Only non-blocking types have fixed default durations.
// Time-blocking types (TAREFA, REUNIAO) use the professional's configured appointmentDuration.
export const DEFAULT_ENTRY_DURATIONS: Record<string, number> = {
  LEMBRETE: 15,
  NOTA: 15,
}
