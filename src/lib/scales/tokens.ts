import { randomBytes, createHash } from "crypto"

/** Validity of a scale-fill link, in days. */
export const SCALE_TOKEN_TTL_DAYS = 7

/**
 * Generates a cryptographically-random public scale token (32 bytes, base64url)
 * and its SHA-256 hex hash. Only the hash is persisted
 * (`ScaleAdministration.tokenHash`); the raw token travels in the link and is
 * never stored — enabling real revocation (supersede/resend) that stateless
 * HMAC links can't provide. Mirrors `src/lib/forms/tokens.ts`.
 */
export function generateScaleToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, tokenHash: hashScaleToken(token) }
}

/** SHA-256 (hex) of a scale token — the only thing stored in the DB. */
export function hashScaleToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Builds the public fill URL for a token: `${baseUrl}/escala/${token}`. */
export function buildScaleUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return `${trimmed}/escala/${token}`
}

/** Computes the link expiry instant: now + ttlDays (default 7). */
export function computeExpiry(now: Date, ttlDays: number = SCALE_TOKEN_TTL_DAYS): Date {
  const days = Number.isFinite(ttlDays) && ttlDays > 0 ? Math.floor(ttlDays) : SCALE_TOKEN_TTL_DAYS
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}
