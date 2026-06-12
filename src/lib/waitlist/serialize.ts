import { parsePreferences } from "./preferences"
import { formatPreferencesSummary } from "./labels"

/** The Prisma shape we select for an entry destined for the API/UI. */
export interface EntryRow {
  id: string
  patientId: string | null
  leadName: string | null
  leadPhone: string | null
  leadEmail: string | null
  professionalProfileId: string | null
  preferences: unknown
  priorityNote: string | null
  priority: number
  status: string
  removedReason: string | null
  lastOfferedAt: Date | null
  createdAt: Date
  patient?: { id: string; name: string; phone: string; isActive: boolean } | null
  professionalProfile?: { user: { name: string } } | null
}

export interface SerializedEntry {
  id: string
  status: string
  patientId: string | null
  name: string
  phone: string | null
  isLead: boolean
  professionalProfileId: string | null
  professionalName: string | null
  preferences: ReturnType<typeof parsePreferences>
  preferencesSummary: string
  priority: number
  priorityNote: string | null
  removedReason: string | null
  lastOfferedAt: string | null
  createdAt: string
}

/** Maps a Prisma entry row into the API/UI shape, parsing preferences safely. */
export function serializeEntry(row: EntryRow): SerializedEntry {
  const prefs = parsePreferences(row.preferences)
  return {
    id: row.id,
    status: row.status,
    patientId: row.patientId,
    name: row.patient?.name ?? row.leadName ?? "—",
    phone: row.patient?.phone ?? row.leadPhone ?? null,
    isLead: row.patientId === null,
    professionalProfileId: row.professionalProfileId,
    professionalName: row.professionalProfile?.user.name ?? null,
    preferences: prefs,
    preferencesSummary: formatPreferencesSummary(prefs),
    priority: row.priority,
    priorityNote: row.priorityNote,
    removedReason: row.removedReason,
    lastOfferedAt: row.lastOfferedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
