/**
 * Public rate-limit API. Preserves the `checkRateLimit(key, config)` signature
 * used by existing call sites (intake, appointment confirm/cancel/lookup).
 *
 * Backend selection:
 *   - test env (NODE_ENV === "test") → in-memory (deterministic, fake-timer friendly)
 *   - Upstash configured → Upstash sliding-window (production)
 *   - Upstash unreachable + failMode="closed" → throw RateLimitUnavailableError
 *   - Upstash unreachable + failMode="open" → in-memory with a hard cap
 *     (FALLBACK_CAP_MAX req/min/key) so an outage cannot uncap abuse
 */

import { checkInMemory } from "./rate-limit-memory"
import {
  checkWithUpstash,
  isUpstashConfigured,
  RateLimitUnavailableError,
} from "./rate-limit-upstash"

export type RateLimitFailureMode = "open" | "closed"

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number
  /** Window size in milliseconds */
  windowMs: number
  /**
   * What to do if the rate-limit backend is unreachable.
   *   - "open" (default): allow the request, but rate-limit via an in-memory
   *     cap (100 req/min/key) so an outage can't uncap abuse.
   *   - "closed": throw RateLimitUnavailableError → caller should 503.
   *     Use for login/signup/superadminLogin where letting the auth endpoints
   *     run uncapped during an outage is the worse option.
   */
  failMode?: RateLimitFailureMode
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter: number
}

/** Fallback cap applied per key when Upstash fails open. */
const FALLBACK_CAP_MAX = 100
const FALLBACK_CAP_WINDOW_MS = 60_000

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const failMode = config.failMode ?? "open"

  // Test env and unconfigured local dev → deterministic in-memory backend.
  if (process.env.NODE_ENV === "test" || !isUpstashConfigured()) {
    return checkInMemory(key, config.maxRequests, config.windowMs)
  }

  try {
    return await checkWithUpstash(key, config.maxRequests, config.windowMs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn("[rate-limit-unavailable]", { key, failMode, message })
    if (failMode === "closed") {
      if (err instanceof RateLimitUnavailableError) throw err
      throw new RateLimitUnavailableError(message)
    }
    // fail-open: still cap per key to cap abuse amplitude
    return checkInMemory(`fallback:${key}`, FALLBACK_CAP_MAX, FALLBACK_CAP_WINDOW_MS)
  }
}

/**
 * Predefined rate limit configurations. Failure mode is baked per preset:
 *   - Public endpoints (`publicApi`, `sensitive`) fail open — availability beats strictness.
 *   - Auth endpoints (`login`, `signup`, `superadminLogin`) fail closed — a
 *     stuffing window during an Upstash outage would undo the point of the limit.
 */
export const RATE_LIMIT_CONFIGS = {
  /** Public API endpoints — 10/min/IP. Used by intake/appointments public routes. */
  publicApi: { maxRequests: 10, windowMs: 60_000, failMode: "open" },
  /** Stricter limit for sensitive actions — 5/min/IP. */
  sensitive: { maxRequests: 5, windowMs: 60_000, failMode: "open" },
  /** NextAuth credentials login — 5 per 15 minutes per IP+email. */
  login: { maxRequests: 5, windowMs: 15 * 60_000, failMode: "closed" },
  /** Public clinic signup — 3 per hour per IP. */
  signup: { maxRequests: 3, windowMs: 60 * 60_000, failMode: "closed" },
  /** Superadmin login — 3 per 15 minutes per IP. */
  superadminLogin: { maxRequests: 3, windowMs: 15 * 60_000, failMode: "closed" },
} as const satisfies Record<string, RateLimitConfig>

export { RateLimitUnavailableError } from "./rate-limit-upstash"
