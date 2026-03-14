import type { GridConfig } from "./grid-config"

/** Convert pixel Y offset to total minutes since midnight, snapped to grid */
export function pixelToMinutes(
  pixelY: number,
  config: Pick<GridConfig, "pixelsPerMinute" | "startHour" | "snapIntervalMinutes">
): number {
  const rawMinutes = config.startHour * 60 + pixelY / config.pixelsPerMinute
  const snapped = Math.round(rawMinutes / config.snapIntervalMinutes) * config.snapIntervalMinutes
  return Math.max(0, Math.min(snapped, 24 * 60 - 1))
}

/** Convert total minutes since midnight to pixel Y offset */
export function minutesToPixel(
  totalMinutes: number,
  config: Pick<GridConfig, "pixelsPerMinute" | "startHour">
): number {
  return (totalMinutes - config.startHour * 60) * config.pixelsPerMinute
}

/** Convert total minutes to { hours, minutes } */
export function minutesToTime(totalMinutes: number): { hours: number; minutes: number } {
  const clamped = Math.max(0, Math.min(totalMinutes, 24 * 60 - 1))
  return {
    hours: Math.floor(clamped / 60),
    minutes: clamped % 60,
  }
}

/** Format minutes since midnight as HH:mm string */
export function formatTimeFromMinutes(totalMinutes: number): string {
  const { hours, minutes } = minutesToTime(totalMinutes)
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}

interface TimeInterval {
  id: string
  startMs: number
  endMs: number
}

/**
 * Find IDs of intervals that visually overlap a proposed time range.
 * This is a presentation-layer hint, NOT a domain conflict check.
 * The server remains the authoritative source for scheduling conflicts.
 */
export function findVisualOverlaps(
  proposedStartMs: number,
  proposedEndMs: number,
  intervals: ReadonlyArray<TimeInterval>,
  excludeId?: string
): string[] {
  const result: string[] = []
  for (const interval of intervals) {
    if (interval.id === excludeId) continue
    if (proposedStartMs < interval.endMs && proposedEndMs > interval.startMs) {
      result.push(interval.id)
    }
  }
  return result
}
