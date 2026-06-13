import type { PatientSession } from "./retention"

const DAY_MS = 24 * 60 * 60 * 1000

export interface RebookingResult {
  total: number
  rebooked: number
  rate: number | null
}

/**
 * Rebooking rate: of the finalized sessions in the period, how many have another
 * (non-cancelled) CONSULTA for the same patient scheduled in (t, t + windowDays].
 *
 * The upper bound is inclusive; the lower bound is strict (a later session, not
 * the same one). `candidateNextSessions` should be non-cancelled CONSULTA rows.
 */
export function computeRebooking(args: {
  finalizedInRange: PatientSession[]
  candidateNextSessions: PatientSession[]
  windowDays: number
}): RebookingResult {
  const { finalizedInRange, candidateNextSessions, windowDays } = args

  // Index candidate session times per patient (ascending).
  const byPatient = new Map<string, number[]>()
  for (const c of candidateNextSessions) {
    const list = byPatient.get(c.patientId) || []
    list.push(c.scheduledAt.getTime())
    byPatient.set(c.patientId, list)
  }
  for (const list of byPatient.values()) list.sort((a, b) => a - b)

  const windowMs = windowDays * DAY_MS
  let rebooked = 0
  for (const s of finalizedInRange) {
    const t = s.scheduledAt.getTime()
    const candidates = byPatient.get(s.patientId)
    if (!candidates) continue
    const hasNext = candidates.some((c) => c > t && c <= t + windowMs)
    if (hasNext) rebooked++
  }

  const total = finalizedInRange.length
  return { total, rebooked, rate: total === 0 ? null : rebooked / total }
}
