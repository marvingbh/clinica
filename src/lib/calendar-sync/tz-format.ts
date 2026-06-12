/**
 * Timezone formatting helpers shared by the Google event mapping and the ICS
 * feed. Unlike the booking module (pinned to São Paulo), these accept an
 * arbitrary IANA `timeZone` so the event body honors `clinic.timezone`.
 *
 * Instants are stored in UTC in the DB; here we render the wall-clock value in
 * the target zone. We use Intl.DateTimeFormat (no tz database dependency).
 */

function partsInZone(
  d: Date,
  timeZone: string
): { year: string; month: string; day: string; hour: string; minute: string; second: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  // Intl can emit "24" for midnight in some engines; normalize to "00".
  let hour = get("hour")
  if (hour === "24") hour = "00"
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  }
}

/** "2026-06-15T14:00:00" wall-clock in `timeZone` (RFC 3339 w/o offset, Google start.dateTime). */
export function formatLocalDateTime(d: Date, timeZone: string): string {
  const p = partsInZone(d, timeZone)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

/** "20260615T140000" wall-clock in `timeZone` (RFC 5545 floating local for ICS). */
export function formatIcsDateLocal(d: Date, timeZone: string): string {
  const p = partsInZone(d, timeZone)
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`
}

/** "20260615" calendar date in `timeZone`, used for the agenda deep-link. */
export function formatDateISOInZone(d: Date, timeZone: string): string {
  const p = partsInZone(d, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}
