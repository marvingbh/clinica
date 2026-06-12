import type { BusyInterval } from "./types"

export type { BusyInterval }

/**
 * Merges overlapping and adjacent (touching) busy intervals into a sorted,
 * disjoint list. Adjacent intervals (end === next.start) merge so back-to-back
 * personal events become one continuous busy block.
 */
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: BusyInterval[] = [{ start: sorted[0].start, end: sorted[0].end }]

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end
    } else {
      merged.push({ start: cur.start, end: cur.end })
    }
  }
  return merged
}

/**
 * Clamps intervals to the [from, to] horizon: drops intervals entirely outside
 * the window and trims those that straddle a boundary. Returns merged-clean
 * intervals (assumes input already disjoint or runs merge first is fine).
 */
export function clampToHorizon(
  intervals: BusyInterval[],
  from: Date,
  to: Date
): BusyInterval[] {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const result: BusyInterval[] = []

  for (const iv of intervals) {
    const s = Math.max(iv.start.getTime(), fromMs)
    const e = Math.min(iv.end.getTime(), toMs)
    if (e > s) result.push({ start: new Date(s), end: new Date(e) })
  }
  return result
}

/**
 * True when a candidate slot [slotStart, slotEnd) overlaps any busy interval.
 * Half-open semantics: a slot that merely touches a busy edge does NOT overlap.
 */
export function overlapsBusy(
  slotStart: Date,
  slotEnd: Date,
  busy: BusyInterval[]
): boolean {
  const s = slotStart.getTime()
  const e = slotEnd.getTime()
  for (const iv of busy) {
    if (s < iv.end.getTime() && e > iv.start.getTime()) return true
  }
  return false
}
