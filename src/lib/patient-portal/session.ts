import { createHash, randomBytes } from "crypto"

/** Sliding window: a session stays alive while used within this many days. */
export const SESSION_SLIDE_DAYS = 30
/** Absolute ceiling regardless of activity. */
export const SESSION_ABSOLUTE_DAYS = 90
/** Deep-link (AGENDA scope) sessions are short-lived. */
export const SESSION_AGENDA_HOURS = 24
/** lastUsedAt is touched at most once per this interval to avoid write churn. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/** 256-bit url-safe random token (the raw value only lives in the cookie). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

/** sha256 hex of a session token — only the hash is persisted. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Cookie name is namespaced per slug so two clinics never share a session. */
export function portalCookieName(slug: string): string {
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, "")
  return `portal_session_${safe}`
}

export interface SessionExpiry {
  expiresAt: Date
  absoluteExpiresAt: Date
}

/** Expiry window for a FULL session created right now. */
export function initialSessionExpiry(now: Date): SessionExpiry {
  return {
    expiresAt: new Date(now.getTime() + SESSION_SLIDE_DAYS * DAY_MS),
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_DAYS * DAY_MS),
  }
}

/** Expiry window for an AGENDA (deep-link) session — fixed 24h, no sliding. */
export function agendaSessionExpiry(now: Date): SessionExpiry {
  const expiresAt = new Date(now.getTime() + SESSION_AGENDA_HOURS * 60 * 60 * 1000)
  return { expiresAt, absoluteExpiresAt: expiresAt }
}

export interface SessionTimestamps {
  lastUsedAt: Date
  expiresAt: Date
  absoluteExpiresAt: Date
  revokedAt?: Date | null
}

/** True when the session has not expired, not hit the ceiling, not revoked. */
export function isSessionValid(session: SessionTimestamps, now: Date): boolean {
  if (session.revokedAt) return false
  if (now.getTime() >= session.expiresAt.getTime()) return false
  if (now.getTime() >= session.absoluteExpiresAt.getTime()) return false
  return true
}

export interface SlideResult {
  shouldTouch: boolean
  expiresAt: Date
}

/**
 * Computes the sliding-expiry update for a valid session. Touches at most once
 * per hour, never extends past the absolute ceiling.
 */
export function slideSession(
  session: { lastUsedAt: Date; expiresAt: Date; absoluteExpiresAt: Date },
  now: Date,
): SlideResult {
  const sinceLastTouch = now.getTime() - session.lastUsedAt.getTime()
  if (sinceLastTouch < SESSION_TOUCH_INTERVAL_MS) {
    return { shouldTouch: false, expiresAt: session.expiresAt }
  }
  const slid = new Date(now.getTime() + SESSION_SLIDE_DAYS * DAY_MS)
  const capped = slid.getTime() > session.absoluteExpiresAt.getTime() ? session.absoluteExpiresAt : slid
  return { shouldTouch: true, expiresAt: capped }
}
