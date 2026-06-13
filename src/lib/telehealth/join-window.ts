import type { JoinState } from "./types"

/**
 * Pure join-window computation and the central state machine. Both the public
 * patient endpoint and the professional button derive their behavior from
 * `resolveJoinState`, evaluated against the LIVE appointment record so the
 * window moves with reschedules and dies with cancellations.
 */

export const JOIN_WINDOW_BEFORE_MIN = 15
export const JOIN_WINDOW_GRACE_AFTER_MIN = 30

export function computeJoinWindow(
  scheduledAt: Date,
  endAt: Date
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: new Date(scheduledAt.getTime() - JOIN_WINDOW_BEFORE_MIN * 60 * 1000),
    closesAt: new Date(endAt.getTime() + JOIN_WINDOW_GRACE_AFTER_MIN * 60 * 1000),
  }
}

export interface JoinStateAppointment {
  type: string
  modality: string | null
  status: string
  scheduledAt: Date
  endAt: Date
}

/**
 * Evaluation order (precedence): DISABLED → NOT_ONLINE → CANCELLED → ENDED
 * → TOO_EARLY → OK.
 */
export function resolveJoinState(
  appointment: JoinStateAppointment,
  clinic: { telehealthEnabled: boolean },
  config: { configured: boolean },
  now: Date
): JoinState {
  if (!clinic.telehealthEnabled || !config.configured) {
    return { kind: "DISABLED" }
  }
  if (appointment.type !== "CONSULTA" || appointment.modality !== "ONLINE") {
    return { kind: "NOT_ONLINE" }
  }
  if (appointment.status.startsWith("CANCELADO")) {
    return { kind: "CANCELLED" }
  }
  const { opensAt, closesAt } = computeJoinWindow(
    appointment.scheduledAt,
    appointment.endAt
  )
  if (appointment.status === "FINALIZADO" || now.getTime() > closesAt.getTime()) {
    return { kind: "ENDED" }
  }
  if (now.getTime() < opensAt.getTime()) {
    return { kind: "TOO_EARLY", opensAt, scheduledAt: appointment.scheduledAt }
  }
  return { kind: "OK" }
}
