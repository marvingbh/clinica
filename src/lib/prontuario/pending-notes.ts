import type { PendingAppointment } from "./types"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** The professional expected to author the note: attending takes priority. */
export function resolveNoteOwnerProfessional(appt: PendingAppointment): string {
  return appt.attendingProfessionalId ?? appt.professionalProfileId
}

export interface PendingFilterOptions {
  /** Minimum hours since the session before it is considered pending (default 24). */
  minHoursSinceSession?: number
  /** Lookback window in days; sessions older than this are ignored (default 14). */
  lookbackDays?: number
}

/**
 * Filter appointments down to those that should generate a pending-note item:
 * - type CONSULTA
 * - status FINALIZADO
 * - has a patient
 * - no existing note (by appointment id)
 * - session ended at least `minHoursSinceSession` ago
 * - session within the `lookbackDays` window
 */
export function filterPendingAppointments(
  appts: PendingAppointment[],
  existingNoteApptIds: Set<string>,
  now: Date,
  opts: PendingFilterOptions = {}
): PendingAppointment[] {
  const minHours = opts.minHoursSinceSession ?? 24
  const lookbackDays = opts.lookbackDays ?? 14
  const minCutoff = now.getTime() - minHours * HOUR_MS
  const lookbackCutoff = now.getTime() - lookbackDays * DAY_MS

  return appts.filter((appt) => {
    if (appt.type !== "CONSULTA") return false
    if (appt.status !== "FINALIZADO") return false
    if (appt.patientId == null) return false
    if (existingNoteApptIds.has(appt.id)) return false
    const t = appt.scheduledAt.getTime()
    if (t > minCutoff) return false // too recent (< minHours ago)
    if (t < lookbackCutoff) return false // outside lookback window
    return true
  })
}

export interface PendingTodoInput {
  professionalProfileId: string
  title: string
  day: string
  sourceAppointmentId: string
}

/** Build an idempotent Todo input for a pending appointment. */
export function buildPendingTodoInput(
  appt: PendingAppointment,
  todayIso: string
): PendingTodoInput {
  const name = appt.patientName ?? "Paciente"
  return {
    professionalProfileId: resolveNoteOwnerProfessional(appt),
    title: `Registrar evolução — ${name}`,
    day: todayIso,
    sourceAppointmentId: appt.id,
  }
}
