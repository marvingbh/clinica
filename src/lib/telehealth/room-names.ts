import { createHmac } from "crypto"

/**
 * Pure derivation of the video room name. The room name is an HMAC of a stable
 * "room key" so it is deterministic, non-guessable, and contains NO PII
 * (never the patient name). Group sessions share a room (RN-08); individual
 * consultations get a per-appointment room (RN-05).
 */

export interface RoomKeyInput {
  id: string
  groupId: string | null
  sessionGroupId: string | null
  scheduledAt: Date
}

/**
 * Stable room key. Group members of the same session land in the same room:
 * - recurring group sessions key by `groupId + scheduledAt` (one room per slot);
 * - one-off group sessions key by `sessionGroupId`;
 * - individual consultations key by `appointmentId`.
 * Reschedule of an individual consultation keeps the same key (id is stable).
 */
export function resolveRoomKey(appointment: RoomKeyInput): string {
  if (appointment.groupId) {
    return `group:${appointment.groupId}:${appointment.scheduledAt.toISOString()}`
  }
  if (appointment.sessionGroupId) {
    return `session:${appointment.sessionGroupId}`
  }
  return `appt:${appointment.id}`
}

/**
 * HMAC-SHA256(roomKey, secret) truncated to 20 hex chars, prefixed "clinica-".
 * No PII. Deterministic for a given (roomKey, secret).
 */
export function deriveRoomName(roomKey: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(roomKey).digest("hex")
  return `clinica-${digest.slice(0, 20)}`
}
