import { parseTimeToMinutes } from "@/lib/booking/timezone"
import type {
  LocalSlot,
  MatchCandidate,
  MatchableEntry,
  OpenSlot,
  WaitlistPreferences,
} from "./types"

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Projects a UTC slot onto a clinic timezone's local wall clock, returning the
 * weekday and "HH:mm" start/end. Uses Intl so any IANA timezone works (Brazil
 * has no DST since 2019, but other clinics may sit in different fixed offsets).
 */
export function toLocalSlot(
  slot: { scheduledAt: Date; endAt: Date },
  timezone: string
): LocalSlot {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(slot.scheduledAt)

  const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "Sun"
  const weekday = WEEKDAY_INDEX[weekdayLabel] ?? 0

  const startTime = localTime(slot.scheduledAt, timezone)
  const endTime = localTime(slot.endAt, timezone)

  return { weekday, startTime, endTime }
}

function localTime(d: Date, timezone: string): string {
  // en-GB renders 24h "HH:mm"; guard the "24:00" edge that some engines emit
  // for midnight.
  const t = d.toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return t === "24:00" ? "00:00" : t
}

/**
 * True when the open slot satisfies an entry's preferences. Empty preference
 * fields mean "accepts anything".
 */
export function slotMatchesPreferences(
  local: LocalSlot,
  modality: OpenSlot["modality"],
  prefs: WaitlistPreferences
): boolean {
  // Weekday
  if (prefs.weekdays.length > 0 && !prefs.weekdays.includes(local.weekday)) {
    return false
  }

  // Time range: the slot must fit entirely inside at least one preferred range.
  if (prefs.timeRanges.length > 0) {
    const slotStart = parseTimeToMinutes(local.startTime)
    const slotEnd = parseTimeToMinutes(local.endTime)
    const fits = prefs.timeRanges.some((r) => {
      const rStart = parseTimeToMinutes(r.start)
      const rEnd = parseTimeToMinutes(r.end)
      return slotStart >= rStart && slotEnd <= rEnd
    })
    if (!fits) return false
  }

  // Modality: null preference accepts both; a null slot modality matches any.
  if (prefs.modality !== null && modality !== null && prefs.modality !== modality) {
    return false
  }

  return true
}

/**
 * Ranks the candidate entries for an open slot.
 *
 * Eligibility: the entry's professional must be the slot's professional OR
 * "qualquer" (null), AND the slot must satisfy the entry's preferences.
 *
 * Ordering: professionalMatch desc → priority asc → createdAt asc.
 * Candidates that already have a session that day are flagged and pushed to the
 * end (the flag is preserved for the UI either way).
 */
export function rankCandidates(input: {
  slot: OpenSlot
  local: LocalSlot
  entries: MatchableEntry[]
  sameDayPatientIds: Set<string>
}): MatchCandidate[] {
  const { slot, local, entries, sameDayPatientIds } = input

  const candidates: MatchCandidate[] = []
  for (const entry of entries) {
    // Professional eligibility.
    const professionalMatch = entry.professionalProfileId === slot.professionalProfileId
    const acceptsAny = entry.professionalProfileId === null
    if (!professionalMatch && !acceptsAny) continue

    // Preference eligibility.
    if (!slotMatchesPreferences(local, slot.modality, entry.preferences)) continue

    const hasSameDayAppointment =
      entry.patientId !== null && sameDayPatientIds.has(entry.patientId)

    candidates.push({ entry, professionalMatch, hasSameDayAppointment })
  }

  candidates.sort((a, b) => {
    // Same-day appointments sink to the bottom.
    if (a.hasSameDayAppointment !== b.hasSameDayAppointment) {
      return a.hasSameDayAppointment ? 1 : -1
    }
    // Explicit professional beats "qualquer".
    if (a.professionalMatch !== b.professionalMatch) {
      return a.professionalMatch ? -1 : 1
    }
    // Manual priority ascending.
    if (a.entry.priority !== b.entry.priority) {
      return a.entry.priority - b.entry.priority
    }
    // Oldest wait first.
    return a.entry.createdAt.getTime() - b.entry.createdAt.getTime()
  })

  return candidates
}
