import { z } from "zod"

// ============================================================================
// Schemas
// ============================================================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
const brDateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/ // DD/MM/YYYY

export const appointmentSchema = z.object({
  patientId: z.string().min(1, "Selecione um paciente"),
  date: z.string().regex(brDateRegex, "Data inválida (DD/MM/AAAA)"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
})

export const editAppointmentSchema = z.object({
  date: z.string().regex(brDateRegex, "Data inválida (DD/MM/AAAA)"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
  price: z.union([z.number().min(0), z.string(), z.null()]).optional().nullable(),
})

export type AppointmentFormData = z.infer<typeof appointmentSchema>
export type EditAppointmentFormData = z.infer<typeof editAppointmentSchema>

// ============================================================================
// Interfaces
// ============================================================================

export interface Patient {
  id: string
  name: string
  phone: string
  email: string | null
}

export interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
    specialty: string | null
    appointmentDuration: number
  } | null
}

export interface AvailabilityRule {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export interface AvailabilityException {
  id: string
  date: string
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
}

export interface AppointmentRecurrence {
  id: string
  recurrenceType: RecurrenceType
  recurrenceEndType: RecurrenceEndType
  occurrences: number | null
  endDate: string | null
  isActive: boolean
  exceptions: string[]
}

export interface Appointment {
  id: string
  scheduledAt: string
  endAt: string
  status: AppointmentStatus
  modality: Modality
  notes: string | null
  price: string | null
  cancellationReason: string | null
  cancelledAt: string | null
  recurrence: AppointmentRecurrence | null
  patient: {
    id: string
    name: string
    email: string | null
    phone: string
    consentWhatsApp?: boolean
    consentEmail?: boolean
  }
  professionalProfile: {
    id: string
    user: {
      name: string
    }
  }
}

export interface TimeSlot {
  time: string
  isAvailable: boolean
  appointments: Appointment[]
  isBlocked: boolean
  blockReason?: string
}

// ============================================================================
// Type Aliases
// ============================================================================

export type RecurrenceType = "WEEKLY" | "BIWEEKLY" | "MONTHLY"
export type RecurrenceEndType = "BY_DATE" | "BY_OCCURRENCES" | "INDEFINITE"
export type Modality = "ONLINE" | "PRESENCIAL"
export type AppointmentStatus =
  | "AGENDADO"
  | "CONFIRMADO"
  | "CANCELADO_PACIENTE"
  | "CANCELADO_PROFISSIONAL"
  | "NAO_COMPARECEU"
  | "FINALIZADO"

export type CancelType = "single" | "series"
