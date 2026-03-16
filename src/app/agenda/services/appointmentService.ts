import { toDateString } from "../lib/utils"
import type { Appointment, BiweeklyHint } from "../lib/types"

export interface FetchAppointmentsParams {
  date: Date
  professionalProfileId?: string
  signal?: AbortSignal
}

export interface BirthdayPatient {
  id: string
  name: string
}

export interface FetchAppointmentsResponse {
  appointments: Appointment[]
  biweeklyHints?: BiweeklyHint[]
  birthdayPatients?: BirthdayPatient[]
}

export interface CreateAppointmentData {
  patientId: string
  date: string
  startTime: string
  modality: "ONLINE" | "PRESENCIAL"
  notes?: string | null
  duration?: number
  professionalProfileId?: string
  additionalProfessionalIds?: string[]
  skipAvailabilityCheck?: boolean
  recurrence?: {
    recurrenceType: "WEEKLY" | "BIWEEKLY" | "MONTHLY"
    recurrenceEndType: "BY_DATE" | "BY_OCCURRENCES" | "INDEFINITE"
    endDate?: string
    occurrences?: number
  }
}

export interface CreateCalendarEntryData {
  type: "TAREFA" | "LEMBRETE" | "NOTA" | "REUNIAO"
  title: string
  date: string
  startTime: string
  notes?: string | null
  duration?: number
  professionalProfileId?: string
  additionalProfessionalIds?: string[]
  patientId?: string
  skipAvailabilityCheck?: boolean
  recurrence?: {
    recurrenceType: "WEEKLY" | "BIWEEKLY"
    recurrenceEndType: "BY_DATE" | "BY_OCCURRENCES" | "INDEFINITE"
    endDate?: string
    occurrences?: number
  }
}

export interface CreateAppointmentResponse {
  appointment?: Appointment
  totalOccurrences?: number
  error?: string
  occurrenceIndex?: number
  availabilityWarning?: boolean
}

export interface UpdateAppointmentData {
  scheduledAt?: string
  endAt?: string
  modality?: "ONLINE" | "PRESENCIAL" | null
  notes?: string | null
  price?: number | null
  additionalProfessionalIds?: string[]
}

export interface UpdateStatusResponse {
  appointment?: Appointment
  error?: string
}

export interface ResendConfirmationResponse {
  notificationsSent?: string[]
  error?: string
}

export interface ToggleExceptionResponse {
  message?: string
  exceptions?: string[]
  error?: string
}

export interface DeleteAppointmentResponse {
  success?: boolean
  error?: string
}

export interface MoveRecurrenceFutureData {
  startTime: string
  endTime: string
  dayOfWeek?: number
}

export interface MoveRecurrenceFutureResponse {
  success?: boolean
  message?: string
  updatedAppointmentsCount?: number
  error?: string
  conflicts?: Array<{ date: string; conflictsWith: string }>
}

export async function moveRecurrenceFuture(
  recurrenceId: string,
  data: MoveRecurrenceFutureData
): Promise<MoveRecurrenceFutureResponse> {
  const body: Record<string, unknown> = {
    startTime: data.startTime,
    endTime: data.endTime,
    applyTo: "future",
  }
  if (data.dayOfWeek !== undefined) {
    body.dayOfWeek = data.dayOfWeek
  }

  const response = await fetch(`/api/appointments/recurrences/${recurrenceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const result = await response.json()

  if (!response.ok) {
    return {
      error: result.conflicts
        ? `Conflitos encontrados em ${result.conflicts.length} data(s)`
        : result.error || "Erro ao atualizar recorrência",
      conflicts: result.conflicts,
    }
  }

  return result
}

export async function fetchAppointmentById(id: string): Promise<Appointment | null> {
  const response = await fetch(`/api/appointments/${id}`)
  if (!response.ok) return null
  const data = await response.json()
  return data.appointment || null
}

export async function fetchAppointments({
  date,
  professionalProfileId,
  signal,
}: FetchAppointmentsParams): Promise<FetchAppointmentsResponse> {
  const params = new URLSearchParams({ date: toDateString(date) })
  if (professionalProfileId) {
    params.set("professionalProfileId", professionalProfileId)
  }

  const url = `/api/appointments?${params.toString()}`

  const response = await fetch(url, { signal })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("ACCESS_DENIED")
    }
    throw new Error("Failed to fetch appointments")
  }

  const data = await response.json()
  return data
}

export interface CreateGroupSessionData {
  patientIds: string[]
  title: string
  date: string
  startTime: string
  modality: "ONLINE" | "PRESENCIAL"
  notes?: string | null
  duration?: number
  professionalProfileId?: string
  additionalProfessionalIds?: string[]
  skipAvailabilityCheck?: boolean
}

export interface CreateGroupSessionResponse {
  appointments?: Appointment[]
  sessionGroupId?: string
  error?: string
  availabilityWarning?: boolean
}

export async function createGroupSession(
  data: CreateGroupSessionData
): Promise<CreateGroupSessionResponse> {
  const response = await fetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  const result = await response.json()

  if (!response.ok) {
    return {
      error: result.error || "Erro ao criar sessão em grupo",
      availabilityWarning: result.availabilityWarning,
    }
  }

  return result
}

export async function createAppointment(
  data: CreateAppointmentData
): Promise<CreateAppointmentResponse> {
  const response = await fetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  const result = await response.json()

  if (!response.ok) {
    return {
      error: result.error || "Erro ao criar agendamento",
      occurrenceIndex: result.occurrenceIndex,
      availabilityWarning: result.availabilityWarning,
    }
  }

  return result
}

export async function createCalendarEntry(
  data: CreateCalendarEntryData
): Promise<CreateAppointmentResponse> {
  const response = await fetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  const result = await response.json()

  if (!response.ok) {
    return {
      error: result.error || "Erro ao criar entrada",
      occurrenceIndex: result.occurrenceIndex,
      availabilityWarning: result.availabilityWarning,
    }
  }

  return result
}

export async function updateAppointment(
  id: string,
  data: UpdateAppointmentData
): Promise<UpdateStatusResponse> {
  const response = await fetch(`/api/appointments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || "Erro ao atualizar agendamento" }
  }

  return result
}

export async function updateStatus(
  id: string,
  status: string,
  reason?: string
): Promise<UpdateStatusResponse> {
  const response = await fetch(`/api/appointments/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...(reason ? { cancellationReason: reason } : {}) }),
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || "Erro ao atualizar status" }
  }

  return result
}

export async function resendConfirmation(id: string): Promise<ResendConfirmationResponse> {
  const response = await fetch(`/api/appointments/${id}/resend-confirmation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || "Erro ao reenviar confirmacao" }
  }

  return result
}

export async function toggleRecurrenceException(
  recurrenceId: string,
  date: string,
  action: "skip" | "unskip"
): Promise<ToggleExceptionResponse> {
  const response = await fetch(`/api/appointments/recurrences/${recurrenceId}/exceptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, action }),
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || `Erro ao ${action === "skip" ? "pular" : "restaurar"} data` }
  }

  return result
}

export async function deleteAppointment(id: string): Promise<DeleteAppointmentResponse> {
  const response = await fetch(`/api/appointments/${id}`, {
    method: "DELETE",
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || "Erro ao excluir agendamento" }
  }

  return { success: true }
}

export async function updateGroupSessionStatus(
  groupId: string | null,
  scheduledAt: string,
  status: string,
  sessionGroupId?: string | null
): Promise<{ success?: boolean; updatedCount?: number; error?: string }> {
  const body: Record<string, string> = { scheduledAt, status }
  if (sessionGroupId) {
    body.sessionGroupId = sessionGroupId
  } else if (groupId) {
    body.groupId = groupId
  }

  const response = await fetch("/api/group-sessions/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || "Erro ao atualizar status do grupo" }
  }

  return result
}

export async function rescheduleGroupSession(
  sessionGroupId: string,
  scheduledAt: string,
  newScheduledAt: string,
  newEndAt: string
): Promise<{ success?: boolean; updatedCount?: number; error?: string }> {
  const response = await fetch("/api/group-sessions/reschedule", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionGroupId, scheduledAt, newScheduledAt, newEndAt }),
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || "Erro ao reagendar sessão" }
  }

  return result
}
