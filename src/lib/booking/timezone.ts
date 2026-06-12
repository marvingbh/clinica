/**
 * Timezone helpers fixed to America/Sao_Paulo.
 *
 * Brazil abolished daylight saving time in 2019, so São Paulo is a constant
 * UTC−3 with no DST transitions. We therefore treat the offset as a fixed
 * "-03:00" rather than pulling in a tz database — this keeps the slot engine
 * pure and dependency-free while staying correct for all dates from 2019 on.
 */

export const SP_UTC_OFFSET = "-03:00"

const MINUTES_PER_DAY = 24 * 60

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Parses "HH:mm" into minutes since midnight. */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10))
  return h * 60 + m
}

/** Formats minutes-since-midnight back into "HH:mm". */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${pad2(h)}:${pad2(m)}`
}

/**
 * Converts a São Paulo wall-clock date + time to a UTC instant.
 * spToUtc("2026-06-15", "14:00") → 2026-06-15T17:00:00.000Z
 */
export function spToUtc(dateISO: string, time: string): Date {
  return new Date(`${dateISO}T${time}:00.000${SP_UTC_OFFSET}`)
}

/** Returns the São Paulo "HH:mm" wall-clock time of a UTC instant. */
export function utcToSpTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  })
}

/** Returns the São Paulo calendar date ("YYYY-MM-DD") of a UTC instant. */
export function utcToSpDateISO(d: Date): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

/** Adds (or subtracts) whole days to a "YYYY-MM-DD" date string, calendar-safe. */
export function addDaysISO(dateISO: string, days: number): string {
  // Anchor at noon UTC to avoid any edge rounding; we only care about the date.
  const base = new Date(`${dateISO}T12:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/** Weekday of a São Paulo calendar date (0=Sunday … 6=Saturday). */
export function spWeekdayOf(dateISO: string): number {
  // Midday SP is the same calendar day in UTC, so getUTCDay is safe here.
  const d = spToUtc(dateISO, "12:00")
  return d.getUTCDay()
}

/** True when `time` ("HH:mm") is a valid clock time within a single day. */
export function isValidTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false
  const mins = parseTimeToMinutes(time)
  return mins >= 0 && mins <= MINUTES_PER_DAY
}
