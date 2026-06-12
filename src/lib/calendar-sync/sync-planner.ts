import type { SyncSnapshot, IntegrationPrefs } from "./types"
import { isSyncableType } from "./event-mapping"

export type SyncAction = "upsert" | "deleteRemote" | "skip"

/** Cancelled statuses that should remove the remote event. */
const CANCELLED_STATUSES = new Set<SyncSnapshot["status"]>([
  "CANCELADO",
  "CANCELADO_ACORDADO",
  "CANCELADO_FALTA",
  "CANCELADO_PROFISSIONAL",
])

/**
 * Decides what a single integration should do for an appointment, given its
 * current snapshot and the integration's preferences:
 *
 * - snapshot null (appointment deleted) → deleteRemote
 * - any cancelled status                → deleteRemote
 * - type no longer syncable for prefs   → deleteRemote (covers preference flips)
 * - otherwise                           → upsert
 */
export function planSyncAction(
  snapshot: SyncSnapshot | null,
  prefs: IntegrationPrefs
): SyncAction {
  if (!snapshot) return "deleteRemote"
  if (CANCELLED_STATUSES.has(snapshot.status)) return "deleteRemote"
  if (!isSyncableType(snapshot.type, prefs)) return "deleteRemote"
  return "upsert"
}
