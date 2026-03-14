/** Configuration for time-proportional grid rendering */
export interface GridConfig {
  pixelsPerMinute: number
  hourHeight: number
  startHour: number
  endHour: number
  snapIntervalMinutes: number
}

export const WEEKLY_GRID: GridConfig = {
  pixelsPerMinute: 1.6,
  hourHeight: 96, // 60 * 1.6
  startHour: 7,
  endHour: 21,
  snapIntervalMinutes: 15,
}

/** Daily grid has dynamic startHour/endHour computed from content */
export const DAILY_GRID_BASE = {
  pixelsPerMinute: 2.4,
  hourHeight: 144, // 60 * 2.4
  snapIntervalMinutes: 15,
} as const
