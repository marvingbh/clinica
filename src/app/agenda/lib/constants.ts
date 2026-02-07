import { AppointmentStatus, CalendarEntryType } from "./types"

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CANCELADO_PACIENTE: "Cancelado (Paciente)",
  CANCELADO_PROFISSIONAL: "Cancelado (Profissional)",
  NAO_COMPARECEU: "Nao compareceu",
  FINALIZADO: "Finalizado",
}

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  AGENDADO: "bg-blue-100 text-blue-800 border-blue-200",
  CONFIRMADO: "bg-green-100 text-green-800 border-green-200",
  CANCELADO_PACIENTE: "bg-red-100 text-red-800 border-red-200",
  CANCELADO_PROFISSIONAL: "bg-red-100 text-red-800 border-red-200",
  NAO_COMPARECEU: "bg-yellow-100 text-yellow-800 border-yellow-200",
  FINALIZADO: "bg-gray-100 text-gray-800 border-gray-200",
}

export const STATUS_BORDER_COLORS: Record<AppointmentStatus, string> = {
  AGENDADO: "border-l-blue-500",
  CONFIRMADO: "border-l-green-500",
  CANCELADO_PACIENTE: "border-l-red-500",
  CANCELADO_PROFISSIONAL: "border-l-red-500",
  NAO_COMPARECEU: "border-l-yellow-500",
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
  text: string
  accent: string
}> = {
  CONSULTA: {
    bg: "bg-white dark:bg-card",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-300",
    accent: "bg-blue-500",
  },
  TAREFA: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-300",
    accent: "bg-amber-500",
  },
  LEMBRETE: {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-200 dark:border-sky-800",
    text: "text-sky-700 dark:text-sky-300",
    accent: "bg-sky-500",
  },
  NOTA: {
    bg: "bg-slate-50 dark:bg-slate-950/30",
    border: "border-slate-200 dark:border-slate-800",
    text: "text-slate-700 dark:text-slate-300",
    accent: "bg-slate-500",
  },
  REUNIAO: {
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    text: "text-violet-700 dark:text-violet-300",
    accent: "bg-violet-500",
  },
}

export const TIME_BLOCKING_TYPES: CalendarEntryType[] = ["CONSULTA", "TAREFA", "REUNIAO"]
export const NON_BLOCKING_TYPES: CalendarEntryType[] = ["LEMBRETE", "NOTA"]

export const DEFAULT_ENTRY_DURATIONS: Record<string, number> = {
  TAREFA: 60,
  LEMBRETE: 15,
  NOTA: 15,
  REUNIAO: 60,
}
