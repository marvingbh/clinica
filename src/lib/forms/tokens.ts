import { randomBytes, createHash } from "crypto"

/** Default validity of a form-fill link, in days. */
export const DEFAULT_EXPIRY_DAYS = 14

/**
 * Generates a cryptographically-random public form token (32 bytes, base64url)
 * and its SHA-256 hex hash. Only the hash is persisted (`FormResponse.tokenHash`);
 * the raw token travels in the link and is never stored — enabling real
 * revocation (supersede/resend) that stateless HMAC links can't provide.
 */
export function generateFormToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, tokenHash: hashFormToken(token) }
}

/** SHA-256 (hex) of a form token — the only thing stored in the DB. */
export function hashFormToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Builds the public fill URL for a token: `${baseUrl}/f/${token}`. */
export function buildFormUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return `${trimmed}/f/${token}`
}

/**
 * Computes the link expiry instant. Clamps the number of days to 1..365 and
 * defaults to {@link DEFAULT_EXPIRY_DAYS}.
 */
export function computeFormExpiry(now: Date, days?: number): Date {
  const d =
    days && Number.isFinite(days)
      ? Math.min(365, Math.max(1, Math.floor(days)))
      : DEFAULT_EXPIRY_DAYS
  return new Date(now.getTime() + d * 24 * 60 * 60 * 1000)
}
