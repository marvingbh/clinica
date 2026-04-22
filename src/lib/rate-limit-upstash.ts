/**
 * Upstash Redis sliding-window rate limiter backend.
 *
 * Module-scope ephemeralCache is required — if recreated per handler invocation,
 * every request pays full Redis round-trip cost. `timeout: 1000` makes Upstash
 * outages surface fast so the caller can decide fail-open/fail-closed.
 */

import { Ratelimit, type Duration } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

export class RateLimitUnavailableError extends Error {
  constructor(message = "Rate limiter unavailable") {
    super(message)
    this.name = "RateLimitUnavailableError"
  }
}

// Module-scope — DO NOT move inside the function.
const ephemeralCache = new Map<string, number>()

let redisClient: Redis | null = null

function getRedis(): Redis | null {
  if (redisClient) return redisClient
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  redisClient = Redis.fromEnv()
  return redisClient
}

// Cache Ratelimit instances by (maxRequests, windowMs) so we don't create a new
// one per call — each instance holds the sliding-window config.
const limiters = new Map<string, Ratelimit>()

function msToDuration(windowMs: number): Duration {
  if (windowMs % (60 * 60 * 1000) === 0) return `${windowMs / (60 * 60 * 1000)} h` as Duration
  if (windowMs % (60 * 1000) === 0) return `${windowMs / (60 * 1000)} m` as Duration
  if (windowMs % 1000 === 0) return `${windowMs / 1000} s` as Duration
  return `${windowMs} ms` as Duration
}

function getLimiter(maxRequests: number, windowMs: number): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null
  const cacheKey = `${maxRequests}:${windowMs}`
  const existing = limiters.get(cacheKey)
  if (existing) return existing
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, msToDuration(windowMs)),
    prefix: `rl:${cacheKey}`,
    ephemeralCache,
    timeout: 1000,
    analytics: false,
  })
  limiters.set(cacheKey, limiter)
  return limiter
}

export function isUpstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

export async function checkWithUpstash(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const limiter = getLimiter(maxRequests, windowMs)
  if (!limiter) throw new RateLimitUnavailableError("Upstash not configured")
  const result = await limiter.limit(key)
  return {
    allowed: result.success,
    remaining: Math.max(0, result.remaining),
    retryAfter: result.reset ? Math.max(0, result.reset - Date.now()) : 0,
  }
}
