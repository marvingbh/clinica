/**
 * Pure helpers for the "Visão de Slots por Recorrência" agenda view.
 * Maps AppointmentRecurrence rows onto a weekday × time slot grid, computes
 * biweekly parity (par/ímpar by ISO week), and resolves the week-of-month
 * badge for MONTHLY recurrences.
 */

export type SlotRecurrenceType = "WEEKLY" | "BIWEEKLY" | "MONTHLY"

export interface RecurrenceForSlot {
  id: string
  type: string
  title: string | null
  recurrenceType: SlotRecurrenceType
  dayOfWeek: number
  startTime: string
  endTime: string
  duration: number
  startDate: string | Date
  endDate: string | Date | null
  professionalProfileId: string
  professionalName: string | null
  patientId: string | null
  patientName: string | null
  /** IDs of additional co-attending professionals (RecurrenceProfessional rows). */
  additionalProfessionalIds: string[]
  /** Active member count when this row represents a TherapyGroup (type === "GROUP"). */
  groupMemberCount?: number
}

export type BiweeklyParity = "par" | "impar"

export interface BiweeklyPair {
  par: RecurrenceForSlot | null
  impar: RecurrenceForSlot | null
  /** True when two or more rows of the same parity share the slot — a data error. */
  conflict: boolean
}

export interface SlotGroup {
  key: string
  dayOfWeek: number
  startTime: string
  /** Latest endTime among the recurrences sharing this slot (covers mixed durations). */
  endTime: string
  recurrences: RecurrenceForSlot[]
}

function maxTime(a: string, b: string): string {
  return a > b ? a : b
}

export interface FreeWeeklySlot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface AvailabilityRuleLike {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number)
  return h * 60 + m
}

function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Generates evenly-spaced free weekly slots inside the professional's
 * availability rules — only those (dayOfWeek, time-range) windows where NO
 * existing recurrence overlaps. A new weekly patient could be slotted in here
 * without conflicting with any existing pattern.
 *
 * `slotMinutes` is the planning unit (typically the professional's
 * appointmentDuration). Free slots are aligned to the start of each
 * availability rule, not to the wall clock.
 */
export function computeWeeklyFreeSlots(
  rules: AvailabilityRuleLike[],
  recurrences: RecurrenceForSlot[],
  slotMinutes: number,
): FreeWeeklySlot[] {
  if (slotMinutes <= 0) return []
  const out: FreeWeeklySlot[] = []
  // Pre-bucket recurrences by dayOfWeek for quick lookup.
  const byDow = new Map<number, RecurrenceForSlot[]>()
  for (const r of recurrences) {
    const existing = byDow.get(r.dayOfWeek)
    if (existing) existing.push(r)
    else byDow.set(r.dayOfWeek, [r])
  }
  for (const rule of rules) {
    if (!rule.isActive) continue
    const ruleStart = parseHHMM(rule.startTime)
    const ruleEnd = parseHHMM(rule.endTime)
    const dayRecurrences = byDow.get(rule.dayOfWeek) ?? []
    for (let t = ruleStart; t + slotMinutes <= ruleEnd; t += slotMinutes) {
      const slotEnd = t + slotMinutes
      const overlaps = dayRecurrences.some((r) => {
        const rStart = parseHHMM(r.startTime)
        const rEnd = parseHHMM(r.endTime)
        return t < rEnd && rStart < slotEnd
      })
      if (!overlaps) {
        out.push({
          dayOfWeek: rule.dayOfWeek,
          startTime: formatHHMM(t),
          endTime: formatHHMM(slotEnd),
        })
      }
    }
  }
  return out
}

function asDate(value: string | Date): Date {
  if (value instanceof Date) return value
  // ISO YYYY-MM-DD (date-only) — anchor at midday so the local-day reading is stable.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`)
  return new Date(value)
}

/**
 * Returns the ISO-8601 week number (1..53) of the given date.
 * Standard algorithm: pick the Thursday of the date's week, then count
 * weeks since the Thursday of the first week of that year.
 */
export function getIsoWeek(date: Date | string): number {
  const d = asDate(date)
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/** Even ISO week → "par", odd → "impar". */
export function getBiweeklyParity(startDate: Date | string): BiweeklyParity {
  return getIsoWeek(startDate) % 2 === 0 ? "par" : "impar"
}

/** Week-of-month for the date (1..5), using simple ceil(day / 7). */
export function getWeekOfMonth(date: Date | string): 1 | 2 | 3 | 4 | 5 {
  const d = asDate(date)
  const week = Math.ceil(d.getDate() / 7)
  return week as 1 | 2 | 3 | 4 | 5
}

/** Compact letter used as a frequency badge on the grid. */
export function formatFrequencyTag(type: SlotRecurrenceType): "S" | "Q" | "M" {
  return type === "WEEKLY" ? "S" : type === "BIWEEKLY" ? "Q" : "M"
}

/**
 * Short Portuguese label for a recurrence frequency (matches the prototype's
 * "Sem"/"Quinz"/"Mens" tags shown inside slot cards).
 */
export function formatFrequencyLabel(type: SlotRecurrenceType): "Sem" | "Quinz" | "Mens" {
  return type === "WEEKLY" ? "Sem" : type === "BIWEEKLY" ? "Quinz" : "Mens"
}

/**
 * Returns the recurrence kind for visual treatment. CONSULTA recurrences map
 * to their frequency type; everything else (REUNIAO, TAREFA — supervisões,
 * terapia pessoal, reuniões) is rendered as a neutral "block".
 */
export type RecurrenceKind = "weekly" | "biweekly" | "monthly" | "block" | "group"

export function classifyRecurrenceKind(r: RecurrenceForSlot): RecurrenceKind {
  if (r.type === "GROUP") return "group"
  if (r.type !== "CONSULTA") return "block"
  if (r.recurrenceType === "WEEKLY") return "weekly"
  if (r.recurrenceType === "BIWEEKLY") return "biweekly"
  return "monthly"
}

function slotKey(r: Pick<RecurrenceForSlot, "dayOfWeek" | "startTime">): string {
  return `${r.dayOfWeek}-${r.startTime}`
}

/**
 * Buckets recurrences by their visual slot (dayOfWeek + startTime). Two
 * recurrences sharing a start time are treated as the same slot even when
 * their durations differ — the slot's endTime is the latest end among them.
 * This lets a par + ímpar biweekly pair render together even when one entry
 * is 50min and the other is 60min.
 */
export function groupRecurrencesIntoSlots(rows: RecurrenceForSlot[]): SlotGroup[] {
  const buckets = new Map<string, SlotGroup>()
  for (const r of rows) {
    const key = slotKey(r)
    const existing = buckets.get(key)
    if (existing) {
      existing.recurrences.push(r)
      existing.endTime = maxTime(existing.endTime, r.endTime)
    } else {
      buckets.set(key, {
        key,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        recurrences: [r],
      })
    }
  }
  return [...buckets.values()].sort((a, b) =>
    a.dayOfWeek !== b.dayOfWeek
      ? a.dayOfWeek - b.dayOfWeek
      : a.startTime.localeCompare(b.startTime),
  )
}

/**
 * Separates the recurrences into discrete layout-ready entries: every
 * non-biweekly row becomes its own entry, and biweeklies sharing a
 * (dayOfWeek, startTime) merge into a single par/ímpar pair entry. This is
 * the shape the grid wants — each entry positions and column-packs as one
 * card on the calendar.
 */
export type LayoutEntry =
  | { kind: "single"; recurrence: RecurrenceForSlot; startTime: string; endTime: string; dayOfWeek: number }
  | { kind: "biweekly-pair"; pair: BiweeklyPair; startTime: string; endTime: string; dayOfWeek: number; key: string }

export function buildLayoutEntries(rows: RecurrenceForSlot[]): LayoutEntry[] {
  const biweekly: RecurrenceForSlot[] = []
  const out: LayoutEntry[] = []
  for (const r of rows) {
    if (r.recurrenceType === "BIWEEKLY" && r.type === "CONSULTA") {
      biweekly.push(r)
    } else {
      out.push({
        kind: "single",
        recurrence: r,
        startTime: r.startTime,
        endTime: r.endTime,
        dayOfWeek: r.dayOfWeek,
      })
    }
  }
  // Group biweeklies by (dayOfWeek, startTime).
  const biBuckets = new Map<string, { rows: RecurrenceForSlot[]; endTime: string; dayOfWeek: number; startTime: string }>()
  for (const r of biweekly) {
    const key = `${r.dayOfWeek}-${r.startTime}`
    const existing = biBuckets.get(key)
    if (existing) {
      existing.rows.push(r)
      existing.endTime = maxTime(existing.endTime, r.endTime)
    } else {
      biBuckets.set(key, { rows: [r], endTime: r.endTime, dayOfWeek: r.dayOfWeek, startTime: r.startTime })
    }
  }
  for (const [key, b] of biBuckets) {
    out.push({
      kind: "biweekly-pair",
      pair: pairBiweekly(b.rows),
      startTime: b.startTime,
      endTime: b.endTime,
      dayOfWeek: b.dayOfWeek,
      key,
    })
  }
  return out
}

/**
 * From a list of biweekly recurrences sharing a slot, returns the matched
 * par/ímpar pair. Earlier `startDate` wins when two share the same parity
 * (the later row is dropped from the pair output but the conflict flag is
 * raised so the UI can surface a warning).
 */
export function pairBiweekly(rows: RecurrenceForSlot[]): BiweeklyPair {
  const byParity: Record<BiweeklyParity, RecurrenceForSlot[]> = { par: [], impar: [] }
  for (const r of rows) {
    if (r.recurrenceType !== "BIWEEKLY") continue
    byParity[getBiweeklyParity(r.startDate)].push(r)
  }
  // Earlier startDate first (deterministic when conflict exists)
  const pick = (xs: RecurrenceForSlot[]): RecurrenceForSlot | null => {
    if (xs.length === 0) return null
    return [...xs].sort((a, b) => asDate(a.startDate).getTime() - asDate(b.startDate).getTime())[0]
  }
  return {
    par: pick(byParity.par),
    impar: pick(byParity.impar),
    conflict: byParity.par.length > 1 || byParity.impar.length > 1,
  }
}
