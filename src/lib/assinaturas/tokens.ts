import { randomBytes, createHash } from "crypto"

/** Default validity of a signing link, in days. */
export const DEFAULT_EXPIRY_DAYS = 30

/**
 * Generates a cryptographically-random signing token (32 bytes, base64url).
 * The raw token is delivered to the signer; only its hash is persisted.
 */
export function generateSigningToken(): string {
  return randomBytes(32).toString("base64url")
}

/** SHA-256 (hex) of a signing token — the only thing stored in the DB. */
export function hashSigningToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Builds the public signing URL for a token. */
export function buildSigningUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return `${trimmed}/assinar/${token}`
}

/**
 * Computes the link expiry instant. Clamps the number of days to a sane
 * range (1..365) and defaults to {@link DEFAULT_EXPIRY_DAYS}.
 */
export function computeExpiry(now: Date, days?: number): Date {
  const d = days && Number.isFinite(days) ? Math.min(365, Math.max(1, Math.floor(days))) : DEFAULT_EXPIRY_DAYS
  return new Date(now.getTime() + d * 24 * 60 * 60 * 1000)
}
