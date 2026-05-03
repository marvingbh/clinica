import type { AppointmentStatus, AppointmentType, AppointmentModality } from "@prisma/client"

export interface PendingAppointment {
  id: string
  scheduledAt: string
  endAt: string
  status: AppointmentStatus
  type: AppointmentType
  modality: AppointmentModality | null
  title: string | null
  notes: string | null
  patient: { id: string; name: string; phone: string | null } | null
  professionalProfile: {
    id: string
    user: { name: string }
  }
}

export type { ProfessionalLite } from "@/lib/professionals/list"

export type StatusFilter = "pendentes" | "agendado" | "confirmado" | "todas"

export type SortKey = "date" | "patient" | "professional" | "status"

export interface SortState {
  key: SortKey
  dir: "asc" | "desc"
}
