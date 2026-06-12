import type { SyncSnapshot, IntegrationPrefs, CalendarPrivacyMode } from "./types"

/** Shape of the appointment row the processor loads (PII-minimized select). */
export interface AppointmentRow {
  id: string
  clinicId: string
  type: string
  status: string
  scheduledAt: Date
  endAt: Date
  title: string | null
  patient: { name: string } | null
  clinic: { name: string; timezone: string }
  professionalProfile: { userId: string } | null
  additionalProfessionals: { professionalProfile: { userId: string } }[]
}

/** Builds the PII-safe snapshot from a loaded appointment row. */
export function toSnapshot(row: AppointmentRow): SyncSnapshot {
  return {
    id: row.id,
    clinicId: row.clinicId,
    type: row.type as SyncSnapshot["type"],
    status: row.status as SyncSnapshot["status"],
    scheduledAt: row.scheduledAt,
    endAt: row.endAt,
    title: row.title,
    patientName: row.patient?.name ?? null,
    clinicName: row.clinic.name,
    timezone: row.clinic.timezone,
  }
}

/** Collects the distinct userIds of the owning + additional professionals. */
export function professionalUserIds(row: AppointmentRow): string[] {
  const ids = new Set<string>()
  if (row.professionalProfile?.userId) ids.add(row.professionalProfile.userId)
  for (const ap of row.additionalProfessionals) {
    if (ap.professionalProfile?.userId) ids.add(ap.professionalProfile.userId)
  }
  return [...ids]
}

export function prefsOf(integration: {
  privacyMode: CalendarPrivacyMode
  syncNonBlocking: boolean
}): IntegrationPrefs {
  return { privacyMode: integration.privacyMode, syncNonBlocking: integration.syncNonBlocking }
}

/** Builds the CALENDAR_SYNC_ERROR email body for a failed/revoked integration. */
export function buildSyncErrorEmail(reason: "revoked" | "error", baseUrl: string): {
  subject: string
  content: string
} {
  const subject = "Sincronização com Google Agenda interrompida"
  const why =
    reason === "revoked"
      ? "O acesso ao Google foi revogado. Reconecte para retomar a sincronização."
      : "A sincronização falhou após várias tentativas. Tente reconectar."
  const content = `${why}\n\nAcesse seu perfil para reconectar:\n${baseUrl}/profile`
  return { subject, content }
}
