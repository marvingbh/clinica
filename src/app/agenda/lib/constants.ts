import { AppointmentStatus } from "./types"

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
