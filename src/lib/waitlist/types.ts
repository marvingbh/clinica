/**
 * Shared types for the waitlist (lista de espera) domain.
 * Framework- and Prisma-agnostic: routes/services map data into these plain
 * shapes before calling the pure functions in this module.
 */

/** Patient/lead preferences for a waitlist entry. Empty fields = "accepts anything". */
export interface WaitlistPreferences {
  /** 0=Sunday … 6=Saturday; [] = any weekday. */
  weekdays: number[]
  /** "HH:mm" ranges; [] = any time. */
  timeRanges: { start: string; end: string }[]
  /** null = any modality. */
  modality: "ONLINE" | "PRESENCIAL" | null
}

/** A slot that opened up (a cancelled CONSULTA), in UTC. */
export interface OpenSlot {
  professionalProfileId: string
  scheduledAt: Date
  endAt: Date
  modality: "ONLINE" | "PRESENCIAL" | null
  sourceAppointmentId: string | null
}

/** A slot projected onto the clinic's local wall clock. */
export interface LocalSlot {
  weekday: number // 0=Sunday … 6=Saturday
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
}

/** Minimal entry shape needed by the pure matching/ranking functions. */
export interface MatchableEntry {
  id: string
  patientId: string | null
  professionalProfileId: string | null
  preferences: WaitlistPreferences
  priority: number
  createdAt: Date
}

/** A ranked candidate for an open slot. */
export interface MatchCandidate {
  entry: MatchableEntry
  /** True when the entry explicitly cited the slot's professional. */
  professionalMatch: boolean
  /** True when the candidate's patient already has a session that day. */
  hasSameDayAppointment: boolean
}
