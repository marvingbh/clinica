/**
 * Pure functions for group session bulk status update logic.
 * Extracted from the API route for testability.
 */

export interface BulkStatusAppointment {
  id: string
  status: string
  patientId: string | null
  professionalProfileId: string
  creditGenerated: boolean
  scheduledAt: Date
  additionalProfessionals: Array<{ professionalProfileId: string }>
}

/**
 * Filters appointments that need updating (not already in target status).
 */
export function getAppointmentsToUpdate(
  appointments: BulkStatusAppointment[],
  targetStatus: string
): BulkStatusAppointment[] {
  return appointments.filter(apt => apt.status !== targetStatus)
}

/**
 * Determines whether a session credit should be created for an appointment
 * when bulk-updating to a new status.
 *
 * Credits are created when transitioning TO CANCELADO_ACORDADO,
 * but only if the appointment has a patient and hasn't already generated one.
 */
export function shouldCreateCredit(
  appointment: BulkStatusAppointment,
  targetStatus: string
): boolean {
  return (
    targetStatus === "CANCELADO_ACORDADO" &&
    !!appointment.patientId &&
    !appointment.creditGenerated
  )
}

/**
 * Determines whether existing session credits should be cleaned up
 * when an appointment transitions away from CANCELADO_ACORDADO.
 */
export function shouldCleanupCredit(
  currentStatus: string,
  targetStatus: string
): boolean {
  return (
    currentStatus === "CANCELADO_ACORDADO" &&
    targetStatus !== "CANCELADO_ACORDADO"
  )
}

/**
 * Checks whether a user owns or participates in all appointments.
 * Used for ownership validation when user cannot manage others' appointments.
 */
export function hasUnownedAppointments(
  appointments: BulkStatusAppointment[],
  professionalProfileId: string
): boolean {
  return appointments.some(apt => {
    const isOwner = apt.professionalProfileId === professionalProfileId
    const isParticipant = apt.additionalProfessionals.some(
      ap => ap.professionalProfileId === professionalProfileId
    )
    return !isOwner && !isParticipant
  })
}

/**
 * Extracts unique patient IDs from appointments that have patients.
 */
export function getUniquePatientIds(
  appointments: BulkStatusAppointment[]
): string[] {
  const ids = appointments
    .filter(apt => apt.patientId)
    .map(apt => apt.patientId!)
  return [...new Set(ids)]
}

/**
 * Builds the credit reason string for a cancelled appointment.
 */
export function buildCreditReason(scheduledAt: Date): string {
  return `Desmarcou - ${scheduledAt.toLocaleDateString("pt-BR")}`
}
