import type { DateRange } from "./types"
import { BR_TZ_OFFSET_MINUTES } from "./types"

export interface AvailabilityRuleSlim {
  dayOfWeek: number // 0 = Sunday
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  isActive: boolean
}

export interface AvailabilityExceptionSlim {
  date: Date | null // specific date (UTC midnight) — null for recurring
  dayOfWeek: number | null // 0-6 for recurring blocks
  isRecurring: boolean
  isAvailable: boolean // false = blocked, true = extra availability
  startTime: string | null // null = whole day
  endTime: string | null
}

/** [start, end) minute-of-day intervals. */
interface Interval {
  start: number // minutes from local midnight
  end: number
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/** Local Y-M-D and day-of-week for a UTC instant under a fixed offset. */
function localParts(utc: Date, tzOffsetMinutes: number) {
  const shifted = new Date(utc.getTime() + tzOffsetMinutes * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    key: `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}-${shifted.getUTCDate()}`,
  }
}

/** Merge overlapping/adjacent intervals and return total covered minutes. */
function unionMinutes(intervals: Interval[]): number {
  if (intervals.length === 0) return 0
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  let total = 0
  let curStart = sorted[0].start
  let curEnd = sorted[0].end
  for (let i = 1; i < sorted.length; i++) {
    const iv = sorted[i]
    if (iv.start <= curEnd) {
      curEnd = Math.max(curEnd, iv.end)
    } else {
      total += curEnd - curStart
      curStart = iv.start
      curEnd = iv.end
    }
  }
  total += curEnd - curStart
  return total
}

/** Subtract blocked intervals from available intervals; returns covered minutes. */
function subtractMinutes(available: Interval[], blocked: Interval[]): number {
  if (available.length === 0) return 0
  // Represent availability as a set of points is overkill; instead, for each
  // available interval, clip out blocked ranges.
  const blockedMerged = mergeIntervals(blocked)
  let total = 0
  for (const av of mergeIntervals(available)) {
    let cursor = av.start
    for (const bl of blockedMerged) {
      if (bl.end <= cursor || bl.start >= av.end) continue
      if (bl.start > cursor) total += bl.start - cursor
      cursor = Math.max(cursor, bl.end)
      if (cursor >= av.end) break
    }
    if (cursor < av.end) total += av.end - cursor
  }
  return total
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const out: Interval[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    const iv = sorted[i]
    if (iv.start <= last.end) last.end = Math.max(last.end, iv.end)
    else out.push({ ...iv })
  }
  return out
}

/**
 * Total available minutes for ONE professional across the range.
 *
 * For each local day in [start, end):
 *  - base availability = union of active weekly rules for that weekday +
 *    any `isAvailable=true` exceptions (specific-date or recurring) that apply
 *  - blocked = `isAvailable=false` exceptions (specific-date or recurring);
 *    whole-day blocks (no startTime) remove the entire day
 *
 * `exceptions` must already include clinic-wide ones for the tenant.
 * `todayCap` (optional, UTC instant) caps the counted days so a future period
 * does not dilute occupancy with days that have not happened yet.
 */
export function availableMinutes(
  rules: AvailabilityRuleSlim[],
  exceptions: AvailabilityExceptionSlim[],
  range: DateRange,
  todayCap?: Date,
  tzOffsetMinutes: number = BR_TZ_OFFSET_MINUTES
): number {
  const activeRules = rules.filter((r) => r.isActive)

  // Effective end: min(range.end, start of day after todayCap).
  let effectiveEnd = range.end
  if (todayCap) {
    const tp = localParts(todayCap, tzOffsetMinutes)
    // start of the day AFTER todayCap, expressed as a UTC instant at local midnight
    const dayAfter = new Date(Date.UTC(tp.year, tp.month, tp.day + 1))
    const capEnd = new Date(dayAfter.getTime() - tzOffsetMinutes * 60_000)
    if (capEnd < effectiveEnd) effectiveEnd = capEnd
  }
  if (effectiveEnd <= range.start) return 0

  // Index exceptions.
  const byDate = new Map<string, AvailabilityExceptionSlim[]>()
  const recurring: AvailabilityExceptionSlim[] = []
  for (const ex of exceptions) {
    if (ex.isRecurring && ex.dayOfWeek != null) {
      recurring.push(ex)
    } else if (ex.date) {
      const lp = localParts(ex.date, tzOffsetMinutes)
      const key = `${lp.year}-${lp.month}-${lp.day}`
      const list = byDate.get(key) || []
      list.push(ex)
      byDate.set(key, list)
    }
  }

  let total = 0
  // Iterate local calendar days. Start from the local day containing range.start.
  const startLp = localParts(range.start, tzOffsetMinutes)
  // Build a UTC instant for local midnight of the first day.
  let dayLocalMidnightUtc = new Date(
    Date.UTC(startLp.year, startLp.month, startLp.day) - tzOffsetMinutes * 60_000
  )

  while (dayLocalMidnightUtc < effectiveEnd) {
    const lp = localParts(dayLocalMidnightUtc, tzOffsetMinutes)
    const dow = lp.dayOfWeek
    const dateKey = `${lp.year}-${lp.month}-${lp.day}`

    const availIntervals: Interval[] = []
    const blockedIntervals: Interval[] = []
    let wholeDayBlocked = false

    // Weekly rules for this weekday.
    for (const r of activeRules) {
      if (r.dayOfWeek === dow) {
        availIntervals.push({ start: toMinutes(r.startTime), end: toMinutes(r.endTime) })
      }
    }

    // Recurring exceptions for this weekday.
    for (const ex of recurring) {
      if (ex.dayOfWeek !== dow) continue
      applyException(ex, availIntervals, blockedIntervals, () => {
        wholeDayBlocked = true
      })
    }

    // Specific-date exceptions.
    for (const ex of byDate.get(dateKey) || []) {
      applyException(ex, availIntervals, blockedIntervals, () => {
        wholeDayBlocked = true
      })
    }

    if (!wholeDayBlocked) {
      const dayMinutes =
        blockedIntervals.length > 0
          ? subtractMinutes(availIntervals, blockedIntervals)
          : unionMinutes(availIntervals)
      total += dayMinutes
    }

    // advance one local day
    dayLocalMidnightUtc = new Date(
      Date.UTC(lp.year, lp.month, lp.day + 1) - tzOffsetMinutes * 60_000
    )
  }

  return total
}

function applyException(
  ex: AvailabilityExceptionSlim,
  avail: Interval[],
  blocked: Interval[],
  markWholeDayBlocked: () => void
) {
  if (ex.isAvailable) {
    // Extra availability window (e.g., a Saturday with no weekly rule).
    if (ex.startTime && ex.endTime) {
      avail.push({ start: toMinutes(ex.startTime), end: toMinutes(ex.endTime) })
    }
  } else {
    // Blocked.
    if (!ex.startTime || !ex.endTime) {
      markWholeDayBlocked()
    } else {
      blocked.push({ start: toMinutes(ex.startTime), end: toMinutes(ex.endTime) })
    }
  }
}

export interface BookedSlot {
  scheduledAt: Date
  endAt: Date
  /** groupId|sessionGroupId for group sessions; null for individual. */
  groupKey: string | null
}

/**
 * Total booked minutes with group-session dedupe: a group session occupies a
 * single agenda block even though each member has their own Appointment row.
 * Dedupe key = groupKey + scheduledAt; individual rows (null groupKey) never dedupe.
 */
export function bookedMinutes(slots: BookedSlot[]): number {
  const seen = new Set<string>()
  let total = 0
  for (const s of slots) {
    if (s.groupKey != null) {
      const key = `${s.groupKey}|${s.scheduledAt.getTime()}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    const mins = Math.max(0, (s.endAt.getTime() - s.scheduledAt.getTime()) / 60_000)
    total += mins
  }
  return Math.round(total)
}

/** booked ÷ available; null ("n/d") when no availability is configured. */
export function occupancyRate(booked: number, available: number): number | null {
  if (available <= 0) return null
  return booked / available
}
