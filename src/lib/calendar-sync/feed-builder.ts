import { buildIcsFeed, icsUid, type IcsEvent } from "./ics"
import { buildEventTitle } from "./privacy"
import type { SyncSnapshot, IntegrationPrefs, CalendarPrivacyMode } from "./types"
import { isSyncableType } from "./event-mapping"

/** Minimal appointment shape needed to render an ICS event. */
export interface FeedAppointment {
  id: string
  clinicId: string
  type: string
  status: string
  scheduledAt: Date
  endAt: Date
  title: string | null
  patient: { name: string } | null
}

const CANCELLED = new Set(["CANCELADO", "CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"])

/**
 * Builds the ICS feed for a professional's appointments, applying the
 * integration's privacy mode and non-blocking preference. Cancelled
 * appointments are emitted with STATUS:CANCELLED so subscribers drop them.
 */
export function buildAppointmentsIcsFeed(opts: {
  calendarName: string
  clinicName: string
  timezone: string
  appointments: FeedAppointment[]
  prefs: IntegrationPrefs
  now: Date
}): string {
  const events: IcsEvent[] = []
  for (const appt of opts.appointments) {
    const snapshot: SyncSnapshot = {
      id: appt.id,
      clinicId: appt.clinicId,
      type: appt.type as SyncSnapshot["type"],
      status: appt.status as SyncSnapshot["status"],
      scheduledAt: appt.scheduledAt,
      endAt: appt.endAt,
      title: appt.title,
      patientName: appt.patient?.name ?? null,
      clinicName: opts.clinicName,
      timezone: opts.timezone,
    }
    if (!isSyncableType(snapshot.type, opts.prefs)) continue
    events.push({
      uid: icsUid(appt.id),
      title: buildEventTitle(snapshot, opts.prefs.privacyMode as CalendarPrivacyMode),
      start: appt.scheduledAt,
      end: appt.endAt,
      cancelled: CANCELLED.has(appt.status),
    })
  }

  return buildIcsFeed({
    calendarName: opts.calendarName,
    timezone: opts.timezone,
    events,
    now: opts.now,
  })
}
