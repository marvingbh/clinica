import { formatDay, parseDay } from "./format"

/**
 * Returns today's date as YYYY-MM-DD (in the local timezone).
 * Accepts an optional `now` for testability.
 */
export function todayIso(now: Date = new Date()): string {
  return formatDay(now)
}

/**
 * Returns YYYY-MM-DD for a date `days` away from `fromIso`.
 * Negative `days` goes backward.
 */
export function addDays(fromIso: string, days: number): string {
  const d = parseDay(fromIso)
  d.setDate(d.getDate() + days)
  return formatDay(d)
}

/**
 * "Próxima semana" = exactly 7 days from `fromIso`.
 */
export function nextWeekIso(fromIso: string): string {
  return addDays(fromIso, 7)
}

/**
 * "Amanhã" relative to a reference date (defaults to today).
 */
export function tomorrowIso(now: Date = new Date()): string {
  return addDays(todayIso(now), 1)
}
