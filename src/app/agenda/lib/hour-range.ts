interface TimeBlock {
  scheduledAt: string | Date
  endAt: string | Date
}

export interface HourRange {
  startHour: number
  endHour: number
}

/**
 * Compute the visible hour range for a grid based on its content.
 * The range expands to fit any block that falls outside the defaults,
 * with 1-hour padding on each side, and is clamped to [0, 24].
 */
export function computeHourRange(
  blocks: ReadonlyArray<TimeBlock>,
  defaults: HourRange,
): HourRange {
  if (blocks.length === 0) {
    return { ...defaults }
  }

  let minHour = 24
  let maxHour = 0

  for (const block of blocks) {
    const start = new Date(block.scheduledAt)
    const end = new Date(block.endAt)
    minHour = Math.min(minHour, start.getHours())
    maxHour = Math.max(maxHour, end.getHours() + (end.getMinutes() > 0 ? 1 : 0))
  }

  const startHour = Math.max(0, Math.min(minHour - 1, defaults.startHour))
  const endHour = Math.min(24, Math.max(maxHour + 1, defaults.endHour))

  return { startHour, endHour }
}
