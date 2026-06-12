/**
 * Effective session duration for a professional in the booking grid:
 * the professional's own appointmentDuration always wins over the clinic
 * fallback (sessionDurationMinutes).
 */
export function effectiveDuration(
  profAppointmentDuration: number | null | undefined,
  fallbackMinutes: number
): number {
  return profAppointmentDuration && profAppointmentDuration > 0
    ? profAppointmentDuration
    : fallbackMinutes
}

/**
 * Effective horizon: the smaller of the clinic horizon and the professional's
 * maxAdvanceBookingDays cap.
 */
export function effectiveHorizon(
  clinicHorizonDays: number,
  profMaxAdvanceBookingDays: number | null | undefined
): number {
  if (profMaxAdvanceBookingDays && profMaxAdvanceBookingDays > 0) {
    return Math.min(clinicHorizonDays, profMaxAdvanceBookingDays)
  }
  return clinicHorizonDays
}
