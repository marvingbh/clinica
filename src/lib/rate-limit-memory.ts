/**
 * In-memory sliding-window rate limiter.
 * Used in tests and as the fail-open fallback when Upstash is unreachable.
 * Not suitable for multi-instance production — on Vercel each lambda has its
 * own Map, so the effective limit is N × configured. The Upstash backend
 * (see rate-limit-upstash.ts) handles production.
 */

export interface MemoryRateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter: number
}

const store = new Map<string, number[]>()

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    const maxAge = 60 * 60 * 1000
    for (const [key, timestamps] of store.entries()) {
      const recent = timestamps.filter((ts) => now - ts < maxAge)
      if (recent.length === 0) store.delete(key)
      else store.set(key, recent)
    }
  }, CLEANUP_INTERVAL_MS)
  cleanupInterval.unref?.()
}

export function checkInMemory(
  key: string,
  maxRequests: number,
  windowMs: number,
): MemoryRateLimitResult {
  startCleanup()
  const now = Date.now()
  const windowStart = now - windowMs

  const existing = store.get(key) ?? []
  const timestamps = existing.filter((ts) => ts > windowStart)

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0]
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(0, oldest + windowMs - now),
    }
  }

  timestamps.push(now)
  store.set(key, timestamps)

  return {
    allowed: true,
    remaining: maxRequests - timestamps.length,
    retryAfter: 0,
  }
}

/** Test helper — clears the store between tests. */
export function __resetMemoryStore() {
  store.clear()
}
