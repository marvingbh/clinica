/**
 * Simple in-memory rate limiter for API endpoints
 * Uses a sliding window algorithm
 *
 * Note: For production with multiple server instances, consider using
 * Redis or a similar distributed cache for rate limiting
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed */
  maxRequests: number
  /** Window size in milliseconds */
  windowMs: number
}

interface RateLimitEntry {
  timestamps: number[]
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter: number
}

// In-memory store for rate limit entries
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup interval - remove old entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    const maxAge = 60 * 60 * 1000 // Remove entries older than 1 hour

    for (const [key, entry] of rateLimitStore.entries()) {
      const recentTimestamps = entry.timestamps.filter(ts => now - ts < maxAge)
      if (recentTimestamps.length === 0) {
        rateLimitStore.delete(key)
      } else {
        entry.timestamps = recentTimestamps
      }
    }
  }, CLEANUP_INTERVAL_MS)

  // Don't prevent process from exiting
  cleanupInterval.unref?.()
}

/**
 * Check if a request should be rate limited
 *
 * @param key - Unique identifier for the rate limit (e.g., "confirm:192.168.1.1")
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and metadata
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  startCleanup()

  const now = Date.now()
  const windowStart = now - config.windowMs

  // Get or create entry
  let entry = rateLimitStore.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    rateLimitStore.set(key, entry)
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(ts => ts > windowStart)

  // Check if limit exceeded
  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0]
    const retryAfter = oldestInWindow + config.windowMs - now

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(0, retryAfter),
    }
  }

  // Add current request timestamp
  entry.timestamps.push(now)

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    retryAfter: 0,
  }
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMIT_CONFIGS = {
  /** Public API endpoints - 10 requests per minute per IP */
  publicApi: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  },
  /** Stricter limit for sensitive actions - 5 requests per minute per IP */
  sensitive: {
    maxRequests: 5,
    windowMs: 60 * 1000,
  },
} as const
