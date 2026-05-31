import { prisma } from "@/lib/prisma"

/**
 * Persistent (Postgres-backed) brute-force / abuse protection for auth endpoints.
 *
 * The in-memory limiter in `rate-limit.ts` resets on every cold start and is
 * per-instance, so it provides no real protection on serverless platforms like
 * Vercel. These helpers record attempts in the `LoginAttempt` table instead, so
 * a lockout is enforced consistently across all instances.
 *
 * Pure helpers (no I/O) are exported separately so the windowing/lockout logic
 * can be unit-tested without a database.
 */

export type AttemptKind = "LOGIN" | "SUPERADMIN" | "SIGNUP"

export interface LockoutConfig {
  /** Number of attempts within the window that triggers a block. */
  max: number
  /** Sliding window length in milliseconds. */
  windowMs: number
}

export const LOCKOUT_CONFIGS: Record<AttemptKind, LockoutConfig> = {
  // 5 failed logins per email per 15 minutes.
  LOGIN: { max: 5, windowMs: 15 * 60 * 1000 },
  // Superadmin is high value — same threshold, the account count is tiny.
  SUPERADMIN: { max: 5, windowMs: 15 * 60 * 1000 },
  // 10 signup attempts per IP per hour (abuse / cost / enumeration control).
  SIGNUP: { max: 10, windowMs: 60 * 60 * 1000 },
}

// ---- pure, unit-testable logic ----

/** Normalize an email/identifier so lockout keys are stable across casing/whitespace. */
export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase()
}

/** A request is locked out once the count of relevant attempts reaches the max. */
export function isLockedOut(attemptCount: number, config: LockoutConfig): boolean {
  return attemptCount >= config.max
}

/**
 * Milliseconds until the caller may try again, given the oldest in-window attempt.
 * Returns 0 when nothing is on record. Never negative.
 */
export function computeRetryAfterMs(
  oldestAttemptAt: Date | null,
  config: LockoutConfig,
  now: number = Date.now()
): number {
  if (!oldestAttemptAt) return 0
  return Math.max(0, oldestAttemptAt.getTime() + config.windowMs - now)
}

// ---- DB-backed operations ----

/** Record a single attempt. Best-effort: never throws into the auth flow. */
export async function recordAttempt(params: {
  identifier: string
  kind: AttemptKind
  success: boolean
  ipAddress?: string | null
}): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        identifier: normalizeIdentifier(params.identifier),
        kind: params.kind,
        success: params.success,
        ipAddress: params.ipAddress ?? null,
      },
    })
  } catch {
    // Telemetry, not a gate — never block (or open) login on a logging failure.
  }
}

/**
 * Check whether an identifier is currently locked out.
 *
 * For LOGIN/SUPERADMIN we count *failures* in the window (a successful login
 * clears them via `clearAttempts`). For SIGNUP we count *all* attempts in the
 * window (there is no "success that resets" — it is a flat per-IP cap).
 */
export async function checkLockout(
  identifier: string,
  kind: AttemptKind
): Promise<{ locked: boolean; retryAfterMs: number }> {
  const config = LOCKOUT_CONFIGS[kind]
  const since = new Date(Date.now() - config.windowMs)
  const where = {
    identifier: normalizeIdentifier(identifier),
    kind,
    createdAt: { gte: since },
    ...(kind === "SIGNUP" ? {} : { success: false }),
  }

  try {
    const [count, oldest] = await Promise.all([
      prisma.loginAttempt.count({ where }),
      prisma.loginAttempt.findFirst({
        where,
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ])

    return {
      locked: isLockedOut(count, config),
      retryAfterMs: computeRetryAfterMs(oldest?.createdAt ?? null, config),
    }
  } catch {
    // If the lookup fails, fail open for availability (do not lock out real users
    // because of a transient DB error). Attempts are still recorded elsewhere.
    return { locked: false, retryAfterMs: 0 }
  }
}

/** Clear recorded failures for an identifier after a successful authentication. */
export async function clearAttempts(identifier: string, kind: AttemptKind): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { identifier: normalizeIdentifier(identifier), kind, success: false },
    })
  } catch {
    // Best-effort cleanup.
  }
}

/** Extract a best-effort client IP from request headers. */
export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  )
}
