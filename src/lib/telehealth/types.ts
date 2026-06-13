/**
 * Telehealth domain types. Mirrors the notifications provider pattern
 * (interface + mock + pure functions). No PII ever leaves these types in
 * a room name or token payload.
 */

export type VideoProviderId = "jitsi" | "mock"

export interface TelehealthConfig {
  provider: VideoProviderId
  /** e.g. "meet.suaclinica.com.br" or "8x8.vc/<tenant>"; null when unset. */
  jitsiDomain: string | null
  /** Provider usable (mock is always usable; jitsi needs a domain). */
  configured: boolean
}

export interface RoomDescriptor {
  /** HMAC-derived, deterministic, no PII. */
  roomName: string
}

export interface JoinInfo {
  provider: VideoProviderId
  domain: string
  roomName: string
  displayName: string
  isModerator: boolean
  /** Header subject shown in the room — never PII ("Teleconsulta"). */
  subject: string
}

export interface VideoProvider {
  id: VideoProviderId
  /** Documented practical participant cap (groups — RN-08). */
  maxParticipants: number
  professionalJoinInfo(room: RoomDescriptor, displayName: string): JoinInfo
  patientJoinInfo(room: RoomDescriptor, displayName: string): JoinInfo
}

/**
 * Central join state machine result. Drives both the public patient endpoint
 * and the professional button. Computed against the LIVE appointment so
 * cancellation invalidates instantly and rescheduling moves the window.
 */
export type JoinState =
  | { kind: "OK" }
  | { kind: "TOO_EARLY"; opensAt: Date; scheduledAt: Date }
  | { kind: "ENDED" }
  | { kind: "CANCELLED" }
  | { kind: "NOT_ONLINE" }
  | { kind: "DISABLED" }
  | { kind: "INVALID" }

/** Fixed header subject — never carries patient PII. */
export const ROOM_SUBJECT = "Teleconsulta"
