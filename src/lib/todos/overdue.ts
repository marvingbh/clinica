import { todayIso } from "./move"

/**
 * A todo is overdue when it is open (not done) and its day is strictly before today.
 * `day` may be a YYYY-MM-DD string or a Date.
 */
export function isOverdue(
  todo: { done: boolean; day: string | Date },
  now: Date = new Date()
): boolean {
  if (todo.done) return false
  const dayIso = typeof todo.day === "string" ? todo.day : isoFromDate(todo.day)
  return dayIso < todayIso(now)
}

function isoFromDate(d: Date): string {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
