import { createHmac, timingSafeEqual } from "crypto"

/** Deep-link token expires this many hours after the session it points to. */
const DEEP_LINK_EXPIRY_HOURS = 24

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required for signing portal links")
  }
  return secret
}

function computeHmac(slug: string, patientId: string, expires: number): string {
  const payload = `portal:${slug}:${patientId}:${expires}`
  return createHmac("sha256", getSecret()).update(payload).digest("hex")
}

/**
 * Signs an OTP-light deep link. Token format: `{patientId}.{slug}.{expires}.{sig}`
 * (base64url-free; slug/patientId are url-safe by construction).
 */
export function signPortalLink(patientId: string, clinicSlug: string, expires: number): string {
  const sig = computeHmac(clinicSlug, patientId, expires)
  return `${patientId}.${clinicSlug}.${expires}.${sig}`
}

export interface PortalLinkVerification {
  valid: boolean
  patientId?: string
  clinicSlug?: string
  error?: string
}

/** Verifies a deep-link token: structure, expiry, then constant-time signature. */
export function verifyPortalLink(token: string): PortalLinkVerification {
  const parts = token.split(".")
  if (parts.length !== 4) return { valid: false, error: "Link invalido" }
  const [patientId, clinicSlug, expiresRaw, sig] = parts
  const expires = Number(expiresRaw)
  if (!patientId || !clinicSlug || !Number.isFinite(expires) || !sig) {
    return { valid: false, error: "Link invalido" }
  }

  const now = Math.floor(Date.now() / 1000)
  if (now > expires) {
    return { valid: false, error: "Link expirado" }
  }

  const expected = computeHmac(clinicSlug, patientId, expires)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(sig, "utf8")
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, error: "Link invalido" }
  }

  return { valid: true, patientId, clinicSlug }
}

/**
 * Builds the full deep-link URL embedded in reminders. Expires 24h after the
 * session start (mirrors the existing confirm/cancel links).
 */
export function buildPortalDeepLink(
  baseUrl: string,
  slug: string,
  patientId: string,
  scheduledAt: Date,
): string {
  const expires = Math.floor(scheduledAt.getTime() / 1000) + DEEP_LINK_EXPIRY_HOURS * 60 * 60
  const token = signPortalLink(patientId, slug, expires)
  return `${baseUrl}/paciente/${slug}/entrar?token=${encodeURIComponent(token)}`
}
