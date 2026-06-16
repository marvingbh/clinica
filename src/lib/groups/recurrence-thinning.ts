import { RecurrenceType } from "@prisma/client"

/**
 * Interval in days for each cadence. MONTHLY is treated as every 4 weeks (28
 * days), matching how group sessions are actually placed by the session
 * generator (see calculateGroupSessionDates).
 */
const INTERVAL_DAYS: Record<RecurrenceType, number> = {
  [RecurrenceType.WEEKLY]: 7,
  [RecurrenceType.BIWEEKLY]: 14,
  [RecurrenceType.MONTHLY]: 28,
}

export interface ThinnableSession {
  id: string
  scheduledAt: Date
}

/** Whole calendar days between two dates (local midnight to local midnight). */
function dayDiff(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}

/**
 * When a group's recurrence becomes LESS frequent (e.g. WEEKLY -> BIWEEKLY),
 * the existing future sessions still sit on the old, denser grid. This returns
 * the ids of the sessions that fall on the "off" dates and must be removed,
 * keeping only those aligned to the new interval from the earliest upcoming
 * session (the anchor).
 *
 * Thinning is date-based: a group can have several appointments on the same date
 * (e.g. one per patient in a dupla). All appointments on an off-cadence date land
 * on the same remainder, so they are removed together.
 *
 * Returns an empty array when the new cadence is equal to or more frequent than
 * the old one — filling in gaps is out of scope here (it is handled by session
 * generation), this function only thins.
 */
export function computeSessionsToThin(
  futureSessions: ThinnableSession[],
  oldType: RecurrenceType,
  newType: RecurrenceType,
): string[] {
  const oldInterval = INTERVAL_DAYS[oldType] ?? 7
  const newInterval = INTERVAL_DAYS[newType] ?? 7

  if (newInterval <= oldInterval) return []
  if (futureSessions.length === 0) return []

  const sorted = [...futureSessions].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  )
  const anchor = sorted[0].scheduledAt

  return sorted
    .filter(s => dayDiff(anchor, s.scheduledAt) % newInterval !== 0)
    .map(s => s.id)
}
