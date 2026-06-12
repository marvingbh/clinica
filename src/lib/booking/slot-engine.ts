import type {
  RuleInput,
  ExceptionInput,
  Slot,
  DaySlots,
  SlotEngineInput,
} from "./types"
import {
  parseTimeToMinutes,
  minutesToTime,
  spToUtc,
  spWeekdayOf,
  addDaysISO,
} from "./timezone"

interface Window {
  start: string // "HH:mm"
  end: string // "HH:mm"
}

/** Does an exception apply to the given date / weekday? */
function exceptionAppliesTo(ex: ExceptionInput, dateISO: string, weekday: number): boolean {
  if (ex.isRecurring) return ex.dayOfWeek === weekday
  return ex.date === dateISO
}

/** Merges overlapping/adjacent minute intervals into a sorted, disjoint list. */
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const [s, e] = sorted[i]
    if (s <= last[1]) {
      last[1] = Math.max(last[1], e)
    } else {
      merged.push([s, e])
    }
  }
  return merged
}

/** Subtracts blocked intervals from base intervals, returning remaining pieces. */
function subtractIntervals(
  base: Array<[number, number]>,
  blocks: Array<[number, number]>
): Array<[number, number]> {
  let result = base
  for (const [bs, be] of blocks) {
    const next: Array<[number, number]> = []
    for (const [s, e] of result) {
      // No overlap → keep as-is.
      if (be <= s || bs >= e) {
        next.push([s, e])
        continue
      }
      // Left remainder.
      if (s < bs) next.push([s, Math.min(bs, e)])
      // Right remainder.
      if (e > be) next.push([Math.max(be, s), e])
    }
    result = next
  }
  return result.filter(([s, e]) => e > s)
}

/**
 * Resolves the available wall-clock windows for a single São Paulo day:
 *   (active weekly rules for the weekday ∪ isAvailable=true exceptions)
 *   − blocking exceptions (specific-date, recurring-weekday, clinic-wide)
 * with partial clipping for time-bounded exceptions.
 */
export function resolveDayWindows(
  dateISO: string,
  rules: RuleInput[],
  exceptions: ExceptionInput[]
): Window[] {
  const weekday = spWeekdayOf(dateISO)

  // Base availability: active rules for this weekday.
  const baseIntervals: Array<[number, number]> = rules
    .filter((r) => r.isActive && r.dayOfWeek === weekday)
    .map((r) => [parseTimeToMinutes(r.startTime), parseTimeToMinutes(r.endTime)] as [number, number])

  const applicable = exceptions.filter((ex) => exceptionAppliesTo(ex, dateISO, weekday))

  // Extra availability windows (isAvailable=true). A null start/end means the
  // whole day becomes available.
  for (const ex of applicable.filter((e) => e.isAvailable)) {
    const start = ex.startTime ? parseTimeToMinutes(ex.startTime) : 0
    const end = ex.endTime ? parseTimeToMinutes(ex.endTime) : 24 * 60
    baseIntervals.push([start, end])
  }

  let available = mergeIntervals(baseIntervals)

  // Blocking exceptions (isAvailable=false). Null start/end blocks the whole day.
  const blocks: Array<[number, number]> = applicable
    .filter((e) => !e.isAvailable)
    .map((ex) => [
      ex.startTime ? parseTimeToMinutes(ex.startTime) : 0,
      ex.endTime ? parseTimeToMinutes(ex.endTime) : 24 * 60,
    ])

  available = subtractIntervals(available, mergeIntervals(blocks))

  return available.map(([s, e]) => ({ start: minutesToTime(s), end: minutesToTime(e) }))
}

/**
 * Generates candidate slots for a day's windows. The grid step is
 * `duration + buffer`, anchored at the start of each window. A candidate is
 * discarded if its session (duration only — buffer is trailing dead time) does
 * not fit entirely inside the window.
 */
export function generateCandidates(
  windows: Window[],
  dateISO: string,
  durationMinutes: number,
  bufferMinutes: number
): Slot[] {
  if (durationMinutes <= 0) return []
  const step = durationMinutes + bufferMinutes
  const slots: Slot[] = []

  for (const w of windows) {
    const winStart = parseTimeToMinutes(w.start)
    const winEnd = parseTimeToMinutes(w.end)
    for (let s = winStart; s + durationMinutes <= winEnd; s += step) {
      const e = s + durationMinutes
      const startLabel = minutesToTime(s)
      const endLabel = minutesToTime(e)
      slots.push({
        start: spToUtc(dateISO, startLabel).toISOString(),
        end: spToUtc(dateISO, endLabel).toISOString(),
        label: startLabel,
      })
    }
  }

  return slots
}

/** True when two half-open [start,end) intervals overlap (back-to-back allowed). */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Computes free slots across a multi-day window. For each day it resolves
 * availability windows, generates candidates, then removes candidates that:
 *  - overlap any busy interval, or
 *  - fall outside the [now + minAdvanceHours, now + horizonDays] booking window.
 */
export function computeFreeSlots(input: SlotEngineInput): DaySlots[] {
  const {
    rules,
    exceptions,
    busy,
    durationMinutes,
    bufferMinutes,
    from,
    days,
    now,
    minAdvanceHours,
    horizonDays,
  } = input

  const earliest = now.getTime() + minAdvanceHours * 60 * 60 * 1000
  const latest = now.getTime() + horizonDays * 24 * 60 * 60 * 1000
  const busyMs = busy.map((b) => [b.start.getTime(), b.end.getTime()] as [number, number])

  const result: DaySlots[] = []

  for (let i = 0; i < days; i++) {
    const dateISO = addDaysISO(from, i)
    const weekday = spWeekdayOf(dateISO)
    const windows = resolveDayWindows(dateISO, rules, exceptions)
    const candidates = generateCandidates(windows, dateISO, durationMinutes, bufferMinutes)

    const free = candidates.filter((c) => {
      const startMs = new Date(c.start).getTime()
      const endMs = new Date(c.end).getTime()
      if (startMs < earliest || startMs > latest) return false
      for (const [bs, be] of busyMs) {
        if (overlaps(startMs, endMs, bs, be)) return false
      }
      return true
    })

    result.push({ date: dateISO, weekday, slots: free })
  }

  return result
}
