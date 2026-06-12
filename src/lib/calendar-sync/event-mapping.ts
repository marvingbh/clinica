import { createHash } from "crypto"
import type {
  SyncSnapshot,
  IntegrationPrefs,
  GoogleEventBody,
  AppointmentType,
} from "./types"
import { buildEventTitle } from "./privacy"
import { formatLocalDateTime, formatDateISOInZone } from "./tz-format"

/** Types that always block time and are synced as opaque events. */
const BLOCKING_TYPES: ReadonlySet<AppointmentType> = new Set<AppointmentType>([
  "CONSULTA",
  "TAREFA",
  "REUNIAO",
])

/** Non-blocking types only synced when the integration opts in. */
const NON_BLOCKING_TYPES: ReadonlySet<AppointmentType> = new Set<AppointmentType>([
  "LEMBRETE",
  "NOTA",
])

/**
 * Whether a given appointment type should be pushed to the calendar for the
 * integration's preferences. CONSULTA/TAREFA/REUNIAO always sync; LEMBRETE/NOTA
 * only when `syncNonBlocking` is enabled.
 */
export function isSyncableType(type: AppointmentType, prefs: IntegrationPrefs): boolean {
  if (BLOCKING_TYPES.has(type)) return true
  if (NON_BLOCKING_TYPES.has(type)) return prefs.syncNonBlocking
  return false
}

/**
 * Builds the Google Calendar event body for an appointment. Timezone comes
 * from the clinic; instants are UTC in the DB and rendered as wall-clock in
 * that zone. The description carries ONLY the agenda deep-link — never notes,
 * phone, or any PII.
 */
export function buildGoogleEventBody(
  snapshot: SyncSnapshot,
  prefs: IntegrationPrefs,
  agendaBaseUrl: string
): GoogleEventBody {
  const transparency = NON_BLOCKING_TYPES.has(snapshot.type) ? "transparent" : "opaque"
  const dateISO = formatDateISOInZone(snapshot.scheduledAt, snapshot.timezone)
  const base = agendaBaseUrl.replace(/\/+$/, "")

  return {
    summary: buildEventTitle(snapshot, prefs.privacyMode),
    description: `${base}/agenda?date=${dateISO}`,
    start: {
      dateTime: formatLocalDateTime(snapshot.scheduledAt, snapshot.timezone),
      timeZone: snapshot.timezone,
    },
    end: {
      dateTime: formatLocalDateTime(snapshot.endAt, snapshot.timezone),
      timeZone: snapshot.timezone,
    },
    transparency,
    extendedProperties: {
      private: {
        clinicaAppointmentId: snapshot.id,
        clinicaClinicId: snapshot.clinicId,
      },
    },
  }
}

/** Stable canonical JSON: sorts object keys recursively so hash is order-insensitive. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key])
    }
    return sorted
  }
  return value
}

/**
 * Deterministic content hash of an event body. Identical content (regardless
 * of key ordering) yields the same hash, so confirm-only transitions are cheap
 * no-ops; any change to title/time/transparency changes the hash.
 */
export function computeSyncHash(body: GoogleEventBody): string {
  const json = JSON.stringify(canonicalize(body))
  return createHash("sha256").update(json).digest("hex")
}
