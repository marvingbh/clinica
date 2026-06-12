/**
 * Shared types for the booking slot engine and public self-booking flow.
 * These are framework- and Prisma-agnostic: routes fetch data and map it into
 * these plain shapes before calling the pure functions in this module.
 */

/** A weekly availability rule for a professional (HH:mm interpreted in São Paulo). */
export interface RuleInput {
  dayOfWeek: number // 0 = Sunday … 6 = Saturday
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  isActive: boolean
}

/**
 * An exception to availability. Three flavours:
 * - specific date: `date` set, `dayOfWeek`/`isRecurring` ignored
 * - recurring weekday block: `isRecurring=true`, `dayOfWeek` set, `date` null
 * - clinic-wide: same shapes, just applied to everyone (resolved by the caller
 *   passing clinic-wide exceptions in the same list)
 *
 * `isAvailable=false` blocks the window; `isAvailable=true` ADDS an extra window.
 * `startTime`/`endTime` null means "entire day".
 */
export interface ExceptionInput {
  date: string | null // "YYYY-MM-DD" (SP) — null for recurring
  dayOfWeek: number | null
  isRecurring: boolean
  isAvailable: boolean
  startTime: string | null // null = whole day
  endTime: string | null
}

/** A blocking appointment interval (only blocksTime=true, non-cancelled). */
export interface BusyInterval {
  start: Date
  end: Date
}

/** A single bookable slot. `start`/`end` are ISO-8601 UTC; `label` is "HH:mm" SP. */
export interface Slot {
  start: string // ISO UTC
  end: string // ISO UTC
  label: string // "HH:mm" in São Paulo
}

/** Slots grouped by calendar day (São Paulo). */
export interface DaySlots {
  date: string // "YYYY-MM-DD" (SP)
  weekday: number // 0=Sunday … 6=Saturday
  slots: Slot[]
}

/** Full input for {@link computeFreeSlots}. */
export interface SlotEngineInput {
  rules: RuleInput[]
  exceptions: ExceptionInput[]
  busy: BusyInterval[]
  durationMinutes: number
  bufferMinutes: number
  from: string // "YYYY-MM-DD" (SP) — first day of the requested window
  days: number // window size (UI asks for 7)
  now: Date
  minAdvanceHours: number
  horizonDays: number
}
