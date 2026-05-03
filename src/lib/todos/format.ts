/**
 * Format a Date as YYYY-MM-DD using its local components (not UTC).
 * Mirrors the helper in `src/lib/appointments/recurrence.ts`.
 */
export function formatDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Parse a YYYY-MM-DD string into a local-time Date at noon (avoids DST/UTC drift).
 */
export function parseDay(iso: string): Date {
  return new Date(iso + "T12:00:00")
}
