import { createHmac, timingSafeEqual } from "crypto"

/**
 * OAuth `state` signing for the Google Calendar connect flow. The state binds
 * the userId + clinicId + issue time under an HMAC keyed by AUTH_SECRET (same
 * pattern as appointment-links). The callback re-verifies it before trusting
 * any code exchange — and additionally checks the userId matches the session.
 */

const DEFAULT_MAX_AGE_SECONDS = 10 * 60 // 10 minutes

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events"
export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly"

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET is required for signing OAuth state")
  }
  return secret
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url")
}

function computeSig(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex")
}

/** Signs `state` = base64url({userId,clinicId,issuedAt}) + "." + hmac. */
export function signOAuthState(userId: string, clinicId: string, issuedAt: number): string {
  const payload = base64url(JSON.stringify({ userId, clinicId, issuedAt }))
  const sig = computeSig(payload)
  return `${payload}.${sig}`
}

export interface VerifiedState {
  valid: boolean
  userId?: string
  clinicId?: string
  error?: string
}

/** Verifies signature + age. Returns the decoded userId/clinicId when valid. */
export function verifyOAuthState(
  state: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS
): VerifiedState {
  const parts = state.split(".")
  if (parts.length !== 2) return { valid: false, error: "Formato de state invalido" }
  const [payload, sig] = parts

  const expected = computeSig(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, error: "Assinatura invalida" }
  }

  let decoded: { userId?: string; clinicId?: string; issuedAt?: number }
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return { valid: false, error: "State corrompido" }
  }

  if (!decoded.userId || !decoded.clinicId || typeof decoded.issuedAt !== "number") {
    return { valid: false, error: "State incompleto" }
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - Math.floor(decoded.issuedAt / 1000)
  if (ageSeconds > maxAgeSeconds || ageSeconds < -60) {
    return { valid: false, error: "State expirado" }
  }

  return { valid: true, userId: decoded.userId, clinicId: decoded.clinicId }
}

export interface AuthUrlOptions {
  clientId: string
  redirectUri: string
  state: string
  includeFreeBusyScope: boolean
}

/**
 * Builds the Google OAuth consent URL. Always requests `calendar.events` for
 * outbound push; adds `calendar.readonly` when the user opts into inbound busy
 * blocks (incremental consent for phase 2).
 */
export function buildGoogleAuthUrl(opts: AuthUrlOptions): string {
  const scopes = [GOOGLE_CALENDAR_EVENTS_SCOPE]
  if (opts.includeFreeBusyScope) scopes.push(GOOGLE_CALENDAR_READONLY_SCOPE)

  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}
