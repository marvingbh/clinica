/**
 * Domain types for the calendar-sync module. Framework-free: Prisma enums are
 * referenced as string-literal unions so the pure functions stay testable
 * without importing the generated client.
 */

export type AppointmentType = "CONSULTA" | "TAREFA" | "LEMBRETE" | "NOTA" | "REUNIAO"

export type AppointmentStatus =
  | "AGENDADO"
  | "CONFIRMADO"
  | "FINALIZADO"
  | "CANCELADO"
  | "CANCELADO_ACORDADO"
  | "CANCELADO_FALTA"
  | "CANCELADO_PROFISSIONAL"

export type CalendarPrivacyMode = "TOTAL" | "PRIMEIRO_NOME"

/**
 * Minimal, PII-safe projection of an Appointment used by the mapping/planner
 * functions. `patientName` is nullable — non-CONSULTA types have no patient.
 */
export interface SyncSnapshot {
  id: string
  clinicId: string
  type: AppointmentType
  status: AppointmentStatus
  scheduledAt: Date
  endAt: Date
  title: string | null
  patientName: string | null
  clinicName: string
  timezone: string
}

export interface IntegrationPrefs {
  privacyMode: CalendarPrivacyMode
  syncNonBlocking: boolean
}

export interface GoogleEventBody {
  summary: string
  description?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  transparency: "opaque" | "transparent"
  extendedProperties: {
    private: { clinicaAppointmentId: string; clinicaClinicId: string }
  }
}

export interface BusyInterval {
  start: Date
  end: Date
}

export interface CalendarClient {
  insertEvent(calendarId: string, body: GoogleEventBody): Promise<{ id: string }>
  updateEvent(calendarId: string, eventId: string, body: GoogleEventBody): Promise<void>
  deleteEvent(calendarId: string, eventId: string): Promise<void>
  findEventsByAppointmentId(
    calendarId: string,
    appointmentId: string
  ): Promise<{ id: string }[]>
  listCalendars(): Promise<{ id: string; summary: string; primary: boolean }[]>
  freeBusy(calendarIds: string[], timeMin: Date, timeMax: Date): Promise<BusyInterval[]>
}

/** Raised on 401 / invalid_grant — the integration is considered REVOGADA. */
export class CalendarAuthError extends Error {
  constructor(message = "Google authorization revoked") {
    super(message)
    this.name = "CalendarAuthError"
  }
}

/** Raised on 429 — carries an optional Retry-After hint in milliseconds. */
export class CalendarRateLimitError extends Error {
  retryAfterMs?: number
  constructor(message = "Google rate limit exceeded", retryAfterMs?: number) {
    super(message)
    this.name = "CalendarRateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

/** Raised when a remote event is gone (404/410) — caller decides recover vs ignore. */
export class CalendarNotFoundError extends Error {
  constructor(message = "Remote event not found") {
    super(message)
    this.name = "CalendarNotFoundError"
  }
}
