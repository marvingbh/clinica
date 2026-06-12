import { randomUUID } from "crypto"
import type { CalendarClient, GoogleEventBody, BusyInterval } from "../types"

/**
 * In-memory / log-only Calendar client for dev and tests (mirrors the
 * whatsapp-mock provider). Selected when CALENDAR_SYNC_PROVIDER !== "google".
 * It never touches the network; it logs calls and returns synthetic ids so the
 * processor exercises the full happy path locally.
 */
export class GoogleCalendarMockClient implements CalendarClient {
  private label: string

  constructor(label = "mock") {
    this.label = label
  }

  async insertEvent(calendarId: string, body: GoogleEventBody): Promise<{ id: string }> {
    const id = `mock-${randomUUID()}`
    console.log(`[calendar-sync:${this.label}] insertEvent ${calendarId} "${body.summary}" -> ${id}`)
    return { id }
  }

  async updateEvent(calendarId: string, eventId: string, body: GoogleEventBody): Promise<void> {
    console.log(
      `[calendar-sync:${this.label}] updateEvent ${calendarId}/${eventId} "${body.summary}"`
    )
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    console.log(`[calendar-sync:${this.label}] deleteEvent ${calendarId}/${eventId}`)
  }

  async findEventsByAppointmentId(): Promise<{ id: string }[]> {
    // The mock has no persisted store, so there are never orphans to recover.
    return []
  }

  async listCalendars(): Promise<{ id: string; summary: string; primary: boolean }[]> {
    return [{ id: "primary", summary: "Agenda principal (mock)", primary: true }]
  }

  async freeBusy(): Promise<BusyInterval[]> {
    return []
  }
}
