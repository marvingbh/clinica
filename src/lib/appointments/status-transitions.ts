/**
 * Pure functions for appointment status transition logic.
 * Extracted from the status route for testability.
 */

export const AppointmentStatus = {
  AGENDADO: "AGENDADO",
  CONFIRMADO: "CONFIRMADO",
  FINALIZADO: "FINALIZADO",
  CANCELADO_ACORDADO: "CANCELADO_ACORDADO",
  CANCELADO_FALTA: "CANCELADO_FALTA",
  CANCELADO_PROFISSIONAL: "CANCELADO_PROFISSIONAL",
} as const

export type AppointmentStatusType = (typeof AppointmentStatus)[keyof typeof AppointmentStatus]

/**
 * Valid status transitions for appointments.
 * Maps from current status to allowed next statuses.
 */
export const VALID_TRANSITIONS: Record<AppointmentStatusType, AppointmentStatusType[]> = {
  AGENDADO: [
    AppointmentStatus.CONFIRMADO,
    AppointmentStatus.FINALIZADO,
    AppointmentStatus.CANCELADO_FALTA,
    AppointmentStatus.CANCELADO_PROFISSIONAL,
    AppointmentStatus.CANCELADO_ACORDADO,
  ],
  CONFIRMADO: [
    AppointmentStatus.FINALIZADO,
    AppointmentStatus.CANCELADO_FALTA,
    AppointmentStatus.CANCELADO_PROFISSIONAL,
    AppointmentStatus.CANCELADO_ACORDADO,
  ],
  FINALIZADO: [],
  CANCELADO_ACORDADO: [AppointmentStatus.CANCELADO_FALTA, AppointmentStatus.CANCELADO_PROFISSIONAL, AppointmentStatus.AGENDADO],
  CANCELADO_FALTA: [AppointmentStatus.CANCELADO_ACORDADO, AppointmentStatus.CANCELADO_PROFISSIONAL, AppointmentStatus.AGENDADO],
  CANCELADO_PROFISSIONAL: [AppointmentStatus.CANCELADO_FALTA, AppointmentStatus.CANCELADO_ACORDADO, AppointmentStatus.AGENDADO],
}

export const STATUS_LABELS: Record<AppointmentStatusType, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  FINALIZADO: "Finalizado",
  CANCELADO_ACORDADO: "Desmarcou",
  CANCELADO_FALTA: "Cancelado (Falta)",
  CANCELADO_PROFISSIONAL: "Cancelado (sem cobrança)",
}

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as AppointmentStatusType]
  if (!allowed) return false
  return allowed.includes(to as AppointmentStatusType)
}

export interface StatusUpdateFields {
  status: AppointmentStatusType
  confirmedAt?: Date | null
  cancelledAt?: Date | null
}

/**
 * Computes the fields to update when transitioning an appointment status.
 */
export function computeStatusUpdateData(targetStatus: string, now: Date): StatusUpdateFields {
  const data: StatusUpdateFields = { status: targetStatus as AppointmentStatusType }

  if (targetStatus === AppointmentStatus.CONFIRMADO) {
    data.confirmedAt = now
  } else if (
    targetStatus === AppointmentStatus.CANCELADO_PROFISSIONAL ||
    targetStatus === AppointmentStatus.CANCELADO_ACORDADO ||
    targetStatus === AppointmentStatus.CANCELADO_FALTA
  ) {
    data.cancelledAt = now
  } else if (targetStatus === AppointmentStatus.AGENDADO) {
    // Clear timestamps when reverting to AGENDADO
    data.confirmedAt = null
    data.cancelledAt = null
  }

  return data
}

/**
 * Whether transitioning to a given status should update the patient's lastVisitAt.
 */
export function shouldUpdateLastVisitAt(targetStatus: string): boolean {
  return targetStatus === AppointmentStatus.FINALIZADO
}
