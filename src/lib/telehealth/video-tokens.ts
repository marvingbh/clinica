import { createHmac, timingSafeEqual } from "crypto"

/**
 * Stable patient video-link token. Mirrors the HMAC link pattern of
 * src/lib/cobranca/charge-links.ts (timing-safe compare). The signature binds
 * the appointmentId only — there is NO embedded expiry. Validity is derived
 * from the LIVE appointment state at request time (RN-03/RN-04), so a
 * reschedule moves the window and a cancellation invalidates access without
 * changing the link.
 */

/** sig = HMAC-SHA256(`${appointmentId}:video`, secret). */
export function signVideoToken(appointmentId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${appointmentId}:video`).digest("hex")
}

/** Opaque URL token: `${appointmentId}.${sig}` (cuid never contains "."). */
export function buildVideoToken(appointmentId: string, secret: string): string {
  return `${appointmentId}.${signVideoToken(appointmentId, secret)}`
}

/** Parse a token into its parts. Returns null for any malformed shape. */
export function parseVideoToken(
  token: string
): { appointmentId: string; sig: string } | null {
  if (typeof token !== "string") return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [appointmentId, sig] = parts
  if (!appointmentId || !sig) return null
  return { appointmentId, sig }
}

/** Timing-safe signature verification. */
export function verifyVideoToken(
  appointmentId: string,
  sig: string,
  secret: string
): boolean {
  const expected = signVideoToken(appointmentId, secret)
  if (typeof sig !== "string" || sig.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}
