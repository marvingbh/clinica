import type { DateRange } from "./types"

export interface PatientSession {
  patientId: string
  scheduledAt: Date
}

export interface RetentionResult {
  cohortSize: number
  reached2ndPct: number | null
  reached5thPct: number | null
  avgSessionsPerPatient: number | null
  medianLifetimeSessions: number | null
  active30: number
  active60: number
  dropped: number
  droppedPatientIds: string[]
  smallSample: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const SMALL_SAMPLE_THRESHOLD = 5

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Retention metrics over the full FINALIZADO CONSULTA history.
 *
 * Cohort = patients whose FIRST finalized session of their history falls inside
 * the period. 2nd/5th-session percentages count finalized sessions on/after the
 * first one, not limited to the period. Activity (30/60d) and "dropped" use the
 * whole history relative to `now`. Dropped = last finalized > 60 days ago AND no
 * future (non-cancelled) booking.
 */
export function computeRetention(args: {
  allFinalizadoSessions: PatientSession[]
  futureBookedPatientIds: Set<string>
  range: DateRange
  now: Date
}): RetentionResult {
  const { allFinalizadoSessions, futureBookedPatientIds, range, now } = args

  // Group sessions by patient, sorted ascending by time.
  const byPatient = new Map<string, Date[]>()
  for (const s of allFinalizadoSessions) {
    const list = byPatient.get(s.patientId) || []
    list.push(s.scheduledAt)
    byPatient.set(s.patientId, list)
  }
  for (const list of byPatient.values()) {
    list.sort((a, b) => a.getTime() - b.getTime())
  }

  // Cohort: first session within [range.start, range.end).
  const cohort: string[] = []
  for (const [patientId, dates] of byPatient) {
    const first = dates[0]
    if (first >= range.start && first < range.end) cohort.push(patientId)
  }

  const cohortSize = cohort.length
  let reached2nd = 0
  let reached5th = 0
  const lifetimes: number[] = []
  for (const patientId of cohort) {
    const count = byPatient.get(patientId)!.length
    lifetimes.push(count)
    if (count >= 2) reached2nd++
    if (count >= 5) reached5th++
  }

  const reached2ndPct = cohortSize === 0 ? null : reached2nd / cohortSize
  const reached5thPct = cohortSize === 0 ? null : reached5th / cohortSize
  const avgSessionsPerPatient =
    cohortSize === 0 ? null : lifetimes.reduce((a, b) => a + b, 0) / cohortSize
  const medianLifetimeSessions = cohortSize === 0 ? null : median(lifetimes)

  // Activity & dropout across the whole base (every patient with history).
  let active30 = 0
  let active60 = 0
  const droppedPatientIds: string[] = []
  const nowMs = now.getTime()
  for (const [patientId, dates] of byPatient) {
    const last = dates[dates.length - 1]
    const ageDays = (nowMs - last.getTime()) / DAY_MS
    if (ageDays <= 30) active30++
    if (ageDays <= 60) active60++
    if (ageDays > 60 && !futureBookedPatientIds.has(patientId)) {
      droppedPatientIds.push(patientId)
    }
  }

  return {
    cohortSize,
    reached2ndPct,
    reached5thPct,
    avgSessionsPerPatient,
    medianLifetimeSessions,
    active30,
    active60,
    dropped: droppedPatientIds.length,
    droppedPatientIds,
    smallSample: cohortSize > 0 && cohortSize < SMALL_SAMPLE_THRESHOLD,
  }
}
