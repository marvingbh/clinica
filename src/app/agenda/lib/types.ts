import { z } from "zod"

// ============================================================================
// Schemas
// ============================================================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
const isoDateRegex = /^(\d{4})-(\d{2})-(\d{2})$/ // YYYY-MM-DD (native date picker)

export const appointmentSchema = z.object({
  patientId: z.string().min(1, "Selecione um paciente"),
  date: z.string().regex(isoDateRegex, "Data inválida"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
})

export const editAppointmentSchema = z.object({
  date: z.string().regex(isoDateRegex, "Data inválida"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).nullable().optional(),
  notes: z.string().max(2000).optional().nullable(),
  price: z.union([z.number().min(0), z.string(), z.null()]).optional().nullable(),
})

export const calendarEntrySchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio").max(200),
  date: z.string().regex(isoDateRegex, "Data inválida"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(5).max(480).optional(),
  notes: z.string().max(2000).optional().nullable(),
})

export type AppointmentFormData = z.infer<typeof appointmentSchema>
export type EditAppointmentFormData = z.infer<typeof editAppointmentSchema>
export type CalendarEntryFormData = z.infer<typeof calendarEntrySchema>

// ============================================================================
// Interfaces
// ============================================================================

export interface Patient {
  id: string
  name: string
  phone: string
  email: string | null
  motherName?: string | null
  fatherName?: string | null
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
  date: string | null
  dayOfWeek: number | null
  isRecurring: boolean
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
  isClinicWide: boolean
  professionalName: string | null
}

export interface AppointmentRecurrence {
  id: string
  recurrenceType: RecurrenceType
  recurrenceEndType: RecurrenceEndType
  dayOfWeek: number // 0 = Sunday, 6 = Saturday
  startTime: string // HH:mm
  endTime: string // HH:mm
  duration: number // minutes
  occurrences: number | null
  endDate: string | null
  isActive: boolean
  exceptions: string[]
}

export interface AlternateWeekInfo {
  pairedAppointmentId: string | null
  pairedPatientName: string | null
  isAvailable: boolean
}

export interface AdditionalProfessional {
  professionalProfile: {
    id: string
    user: { name: string }
  }
}

export interface Appointment {
  id: string
  scheduledAt: string
  endAt: string
  status: AppointmentStatus
  type: CalendarEntryType
  title: string | null
  blocksTime: boolean
  modality: Modality | null
  notes: string | null
  price: string | null
  cancellationReason: string | null
  cancelledAt: string | null
  groupId: string | null  // Links to TherapyGroup for group sessions
  recurrence: AppointmentRecurrence | null
  alternateWeekInfo?: AlternateWeekInfo // For biweekly appointments, shows who is in the alternate week
  additionalProfessionals?: AdditionalProfessional[]
  patient: {
    id: string
    name: string
    email: string | null
    phone: string
    birthDate?: string | null
    consentWhatsApp?: boolean
    consentEmail?: boolean
  } | null
  professionalProfile: {
    id: string
    user: {
      name: string
    }
  }
}

export interface BiweeklyHint {
  time: string
  professionalProfileId: string
  patientName: string
  appointmentId: string
}

export interface TimeSlot {
  time: string
  isAvailable: boolean
  appointments: Appointment[]
  isBlocked: boolean
  blockReason?: string
  biweeklyHint?: BiweeklyHint
}

// ============================================================================
// Type Aliases
// ============================================================================

export type CalendarEntryType = "CONSULTA" | "TAREFA" | "LEMBRETE" | "NOTA" | "REUNIAO"
export type RecurrenceType = "WEEKLY" | "BIWEEKLY" | "MONTHLY"
export type RecurrenceEndType = "BY_DATE" | "BY_OCCURRENCES" | "INDEFINITE"
export type Modality = "ONLINE" | "PRESENCIAL"
export type AppointmentStatus =
  | "AGENDADO"
  | "CONFIRMADO"
  | "CANCELADO_ACORDADO"
  | "CANCELADO_FALTA"
  | "CANCELADO_PROFISSIONAL"
  | "FINALIZADO"

export type CancelType = "single" | "series"

// ============================================================================
// Group Session Types
// ============================================================================

export interface GroupSessionParticipant {
  appointmentId: string
  patientId: string
  patientName: string
  status: AppointmentStatus
}

export interface GroupSession {
  groupId: string
  groupName: string
  scheduledAt: string
  endAt: string
  professionalProfileId: string
  professionalName: string
  additionalProfessionals?: Array<{
    professionalProfileId: string
    professionalName: string
  }>
  participants: GroupSessionParticipant[]
}
