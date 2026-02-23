import { isOffWeek } from "./recurrence"

// --- Types ---

export interface BiweeklyRecurrence {
  id: string
  professionalProfileId: string
  patientId: string | null
  dayOfWeek: number
  startTime: string // "HH:mm"
  startDate: Date
  patient: { id: string; name: string } | null
}

export interface BiweeklyAppointment {
  id: string
  scheduledAt: Date
  professionalProfileId: string
  patientId: string | null
  patient?: { name: string } | null
  recurrence?: { recurrenceType: string; isActive: boolean } | null
}

export interface BiweeklyHint {
  time: string
  professionalProfileId: string
  patientName: string
  recurrenceId: string
  date?: string
}

export interface PairedInfo {
  recurrenceId: string
  patientName: string | null
}

export interface AlternateWeekInfo {
  pairedAppointmentId: string | null
  pairedPatientName: string | null
  isAvailable: boolean
}

// --- Formatting helpers ---

/** Format a Date to "HH:mm" string */
export function formatTimeStr(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/** Format a Date to "YYYY-MM-DD" string */
export function formatDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/**
 * Build a composite key for slot identification: "YYYY-MM-DD|professionalId|HH:mm"
 * Single source of truth for the key format used across hints, pairing, and blocking.
 */
export function buildSlotKey(date: Date, professionalProfileId: string): string {
  return `${formatDateStr(date)}|${professionalProfileId}|${formatTimeStr(date)}`
}

// --- Core pairing logic ---

/**
 * SINGLE SOURCE OF TRUTH for pairing criteria.
 * Matches: same professional + same time + same dayOfWeek + different patient.
 */
export function findPairedRecurrence(
  appointment: { scheduledAt: Date; professionalProfileId: string; patientId: string | null },
  recurrences: BiweeklyRecurrence[]
): BiweeklyRecurrence | null {
  const aptTimeStr = formatTimeStr(appointment.scheduledAt)
  const aptDayOfWeek = appointment.scheduledAt.getDay()

  return recurrences.find(rec =>
    rec.professionalProfileId === appointment.professionalProfileId &&
    rec.startTime === aptTimeStr &&
    rec.dayOfWeek === aptDayOfWeek &&
    rec.patientId !== appointment.patientId
  ) || null
}

// --- Biweekly hints ---

/**
 * Compute biweekly hints (off-week empty slots showing alternate patient).
 * Pure function — no DB calls.
 */
export function computeBiweeklyHints(params: {
  dateRangeStart: string
  dateRangeEnd: string
  recurrences: BiweeklyRecurrence[]
  occupiedSlots: Set<string>
}): BiweeklyHint[] {
  const { dateRangeStart, dateRangeEnd, recurrences, occupiedSlots } = params
  const hints: BiweeklyHint[] = []

  const current = new Date(dateRangeStart + "T12:00:00")
  const end = new Date(dateRangeEnd + "T12:00:00")

  while (current <= end) {
    const dayOfWeek = current.getDay()
    const dateStr = formatDateStr(current)

    for (const rec of recurrences) {
      if (rec.dayOfWeek !== dayOfWeek) continue
      if (!isOffWeek(rec.startDate, dateStr)) continue
      if (!rec.patient?.name) continue
      const slotKey = `${dateStr}|${rec.professionalProfileId}|${rec.startTime}`
      if (occupiedSlots.has(slotKey)) continue

      hints.push({
        time: rec.startTime,
        professionalProfileId: rec.professionalProfileId,
        patientName: rec.patient.name,
        recurrenceId: rec.id,
        date: dateStr,
      })
    }

    current.setDate(current.getDate() + 1)
  }

  return hints
}

// --- Paired recurrence map ---

/**
 * Build Map of appointmentId -> paired recurrence info.
 * Uses findPairedRecurrence internally — no duplication.
 */
export function computePairedRecurrenceMap(
  biweeklyAppointments: BiweeklyAppointment[],
  recurrences: BiweeklyRecurrence[]
): Map<string, PairedInfo> {
  const map = new Map<string, PairedInfo>()

  for (const apt of biweeklyAppointments) {
    const pairedRec = findPairedRecurrence(apt, recurrences)
    map.set(apt.id, {
      recurrenceId: pairedRec?.id || "",
      patientName: pairedRec?.patient?.name || null,
    })
  }

  return map
}

// --- Blocked alternate slots ---

/**
 * Build Set of slot keys blocked by non-CONSULTA entries on alternate weeks.
 */
export function buildBlockedAlternateKeys(
  blockingEntries: Array<{ scheduledAt: Date; professionalProfileId: string }>
): Set<string> {
  const keys = new Set<string>()
  for (const entry of blockingEntries) {
    keys.add(buildSlotKey(entry.scheduledAt, entry.professionalProfileId))
  }
  return keys
}

// --- Annotate appointments ---

/**
 * Annotate appointments with alternateWeekInfo (paired partner name, availability).
 * pairedAppointmentIds is optional — maps appointmentId to the actual paired appointment ID.
 */
export function annotateAlternateWeekInfo<T extends BiweeklyAppointment>(
  appointments: T[],
  pairedMap: Map<string, PairedInfo>,
  blockedSlots: Set<string>,
  pairedAppointmentIds?: Map<string, string>
): Array<T & { alternateWeekInfo?: AlternateWeekInfo }> {
  return appointments.map(apt => {
    if (apt.recurrence?.recurrenceType !== "BIWEEKLY" || !apt.recurrence.isActive || !apt.patient) {
      return apt
    }

    const paired = pairedMap.get(apt.id)

    // Check if a blocking entry exists on the alternate week at the same time
    const altDate = new Date(apt.scheduledAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    const altKey = buildSlotKey(altDate, apt.professionalProfileId)

    return {
      ...apt,
      alternateWeekInfo: {
        pairedAppointmentId: pairedAppointmentIds?.get(apt.id) || null,
        pairedPatientName: paired?.patientName || null,
        isAvailable: !paired?.patientName && !blockedSlots.has(altKey),
      },
    }
  })
}
