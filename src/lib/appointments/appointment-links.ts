import { createHmac, timingSafeEqual } from "crypto"
import {
  getAppointmentLinkSecret,
  getLegacyAppointmentLinkSecret,
  isCompromiseRotation,
} from "../env"

export type LinkAction = "confirm" | "cancel"

const EXPIRY_HOURS = 24

function computeHmac(secret: string, appointmentId: string, action: LinkAction, expires: number): string {
  const payload = `${appointmentId}:${action}:${expires}`
  return createHmac("sha256", secret).update(payload).digest("hex")
}

/**
 * Constant-time HMAC comparison. Accepts signatures from both the current and
 * legacy appointment-link secrets during a rotation grace window. If
 * `ROTATION_REASON=compromise`, the legacy secret is never accepted.
 */
export function verifySignature(
  appointmentId: string,
  action: LinkAction,
  expires: number,
  sig: string,
): boolean {
  const candidate = Buffer.from(sig, "hex")
  if (candidate.length !== 32) return false

  const primary = Buffer.from(computeHmac(getAppointmentLinkSecret(), appointmentId, action, expires), "hex")
  if (timingSafeEqual(candidate, primary)) return true

  if (isCompromiseRotation()) return false

  const legacy = getLegacyAppointmentLinkSecret()
  if (!legacy) return false
  const legacyBuf = Buffer.from(computeHmac(legacy, appointmentId, action, expires), "hex")
  return timingSafeEqual(candidate, legacyBuf)
}

export function signLink(
  appointmentId: string,
  action: LinkAction,
  scheduledAt: Date,
): { expires: number; sig: string } {
  const expires = Math.floor(scheduledAt.getTime() / 1000) + EXPIRY_HOURS * 60 * 60
  const sig = computeHmac(getAppointmentLinkSecret(), appointmentId, action, expires)
  return { expires, sig }
}

export function verifyLink(
  appointmentId: string,
  action: LinkAction,
  expires: number,
  sig: string,
): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000)
  if (now > expires) {
    return { valid: false, error: "Este link expirou. Entre em contato com a clinica para um novo link." }
  }

  if (!verifySignature(appointmentId, action, expires, sig)) {
    return { valid: false, error: "Link invalido" }
  }

  return { valid: true }
}

export function buildConfirmUrl(baseUrl: string, appointmentId: string, scheduledAt: Date): string {
  const { expires, sig } = signLink(appointmentId, "confirm", scheduledAt)
  return `${baseUrl}/confirm?id=${appointmentId}&expires=${expires}&sig=${sig}`
}

export function buildCancelUrl(baseUrl: string, appointmentId: string, scheduledAt: Date): string {
  const { expires, sig } = signLink(appointmentId, "cancel", scheduledAt)
  return `${baseUrl}/cancel?id=${appointmentId}&expires=${expires}&sig=${sig}`
}
