/**
 * Pure functions for bulk appointment cancellation logic.
 * Extracted for testability following the DDD pattern in src/lib/groups/bulk-status.ts.
 */

export interface BulkCancelAppointment {
  id: string
  status: string
  type: string
  scheduledAt: Date
  recurrenceId: string | null
  patientId: string | null
  professionalProfileId: string
  patient: { id: string; name: string } | null
  professionalName: string
}

export interface BulkCancelSummary {
  total: number
  byType: Record<string, number>
  patients: Array<{ id: string; name: string }>
}

export interface BulkCancelValidation {
  valid: boolean
  error?: string
}

const CANCELLABLE_STATUSES = ["AGENDADO", "CONFIRMADO"]
const CANCELLABLE_TYPES = ["CONSULTA", "REUNIAO"]
const MAX_DATE_RANGE_DAYS = 90
const MIN_REASON_LENGTH = 3

/**
 * Filters appointments to only those that can be bulk-cancelled.
 * Must be CONSULTA or REUNIAO with status AGENDADO or CONFIRMADO.
 */
export function filterCancellableAppointments(
  appointments: BulkCancelAppointment[]
): BulkCancelAppointment[] {
  return appointments.filter(
    (apt) =>
      CANCELLABLE_STATUSES.includes(apt.status) &&
      CANCELLABLE_TYPES.includes(apt.type)
  )
}

/**
 * Builds a summary of appointments to be cancelled.
 * Returns total count, breakdown by type, and unique patient list.
 */
export function buildBulkCancelSummary(
  appointments: BulkCancelAppointment[]
): BulkCancelSummary {
  const byType: Record<string, number> = {}
  const patientMap = new Map<string, string>()

  for (const apt of appointments) {
    byType[apt.type] = (byType[apt.type] || 0) + 1
    if (apt.patient) {
      patientMap.set(apt.patient.id, apt.patient.name)
    }
  }

  const patients = Array.from(patientMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  return { total: appointments.length, byType, patients }
}

/**
 * Validates the date range for a bulk cancel request.
 * Ensures start <= end and range does not exceed MAX_DATE_RANGE_DAYS.
 */
export function validateDateRange(
  startDate: string,
  endDate: string
): BulkCancelValidation {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { valid: false, error: "Datas devem estar no formato YYYY-MM-DD" }
  }

  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: "Datas invalidas" }
  }

  // Auto-swap if inverted
  const [effectiveStart, effectiveEnd] =
    start > end ? [end, start] : [start, end]

  const diffMs = effectiveEnd.getTime() - effectiveStart.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays > MAX_DATE_RANGE_DAYS) {
    return {
      valid: false,
      error: `Periodo maximo de ${MAX_DATE_RANGE_DAYS} dias`,
    }
  }

  return { valid: true }
}

/**
 * Validates the cancellation reason.
 */
export function validateReason(reason: string): BulkCancelValidation {
  const trimmed = reason.trim()
  if (trimmed.length < MIN_REASON_LENGTH) {
    return {
      valid: false,
      error: `Motivo deve ter pelo menos ${MIN_REASON_LENGTH} caracteres`,
    }
  }
  return { valid: true }
}

/**
 * Normalizes the date range, auto-swapping if start > end.
 * Returns [startDate, endDate] as YYYY-MM-DD strings.
 */
export function normalizeDateRange(
  startDate: string,
  endDate: string
): [string, string] {
  if (startDate > endDate) return [endDate, startDate]
  return [startDate, endDate]
}

/**
 * Finds recurrence IDs where ALL remaining active appointments are being cancelled.
 * These recurrences should be deactivated to prevent the cron from regenerating.
 */
export function findRecurrencesToDeactivate(
  cancelledIds: Set<string>,
  allRecurrenceAppointments: Array<{
    id: string
    recurrenceId: string
    status: string
  }>
): string[] {
  // Group by recurrence
  const byRecurrence = new Map<
    string,
    Array<{ id: string; status: string }>
  >()

  for (const apt of allRecurrenceAppointments) {
    const list = byRecurrence.get(apt.recurrenceId) || []
    list.push({ id: apt.id, status: apt.status })
    byRecurrence.set(apt.recurrenceId, list)
  }

  const toDeactivate: string[] = []

  for (const [recurrenceId, appointments] of byRecurrence) {
    // Check if all AGENDADO/CONFIRMADO appointments in this recurrence are being cancelled
    const activeAppointments = appointments.filter((a) =>
      CANCELLABLE_STATUSES.includes(a.status)
    )
    const allBeingCancelled = activeAppointments.every((a) =>
      cancelledIds.has(a.id)
    )

    if (activeAppointments.length > 0 && allBeingCancelled) {
      toDeactivate.push(recurrenceId)
    }
  }

  return toDeactivate
}
