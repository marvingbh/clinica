import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Prisma (variable names prefixed with `mock` are allowed in vi.mock factories)
const mockCount = vi.fn()
const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockDeleteMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    loginAttempt: {
      count: (...a: unknown[]) => mockCount(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
    },
  },
}))

import {
  normalizeIdentifier,
  isLockedOut,
  computeRetryAfterMs,
  LOCKOUT_CONFIGS,
  clientIpFromHeaders,
  checkLockout,
  recordAttempt,
} from "./auth-rate-limit"

describe("normalizeIdentifier", () => {
  it("lowercases and trims", () => {
    expect(normalizeIdentifier("  User@Example.COM ")).toBe("user@example.com")
  })

  it("is stable for already-normalized values", () => {
    expect(normalizeIdentifier("a@b.com")).toBe("a@b.com")
  })
})

describe("isLockedOut", () => {
  const config = { max: 5, windowMs: 1000 }

  it("is not locked below the threshold", () => {
    expect(isLockedOut(0, config)).toBe(false)
    expect(isLockedOut(4, config)).toBe(false)
  })

  it("locks at and above the threshold", () => {
    expect(isLockedOut(5, config)).toBe(true)
    expect(isLockedOut(99, config)).toBe(true)
  })
})

describe("computeRetryAfterMs", () => {
  const config = { max: 5, windowMs: 15 * 60 * 1000 }

  it("returns 0 when no attempt is on record", () => {
    expect(computeRetryAfterMs(null, config, 1_000_000)).toBe(0)
  })

  it("returns the remaining window from the oldest attempt", () => {
    const now = 1_000_000
    const oldest = new Date(now - 60_000) // 1 minute ago
    // 15min window - 1min elapsed = 14min remaining
    expect(computeRetryAfterMs(oldest, config, now)).toBe(15 * 60 * 1000 - 60_000)
  })

  it("never returns a negative value once the window has passed", () => {
    const now = 1_000_000
    const oldest = new Date(now - 20 * 60 * 1000) // older than the window
    expect(computeRetryAfterMs(oldest, config, now)).toBe(0)
  })
})

describe("LOCKOUT_CONFIGS", () => {
  it("defines login, superadmin and signup configs", () => {
    expect(LOCKOUT_CONFIGS.LOGIN.max).toBeGreaterThan(0)
    expect(LOCKOUT_CONFIGS.SUPERADMIN.max).toBeGreaterThan(0)
    expect(LOCKOUT_CONFIGS.SIGNUP.max).toBeGreaterThan(0)
    expect(LOCKOUT_CONFIGS.LOGIN.windowMs).toBeGreaterThan(0)
  })
})

describe("checkLockout (DB-backed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue(null)
  })

  it("LOGIN counts only failures (success:false) for the identifier", async () => {
    mockCount.mockResolvedValue(2)
    await checkLockout("USER@Example.com", "LOGIN")
    const where = mockCount.mock.calls[0][0].where
    expect(where.identifier).toBe("user@example.com") // normalized
    expect(where.kind).toBe("LOGIN")
    expect(where.success).toBe(false)
  })

  it("SIGNUP counts ALL attempts (no success filter)", async () => {
    mockCount.mockResolvedValue(3)
    await checkLockout("203.0.113.5", "SIGNUP")
    const where = mockCount.mock.calls[0][0].where
    expect(where.kind).toBe("SIGNUP")
    expect("success" in where).toBe(false)
  })

  it("locks once the count reaches the configured max", async () => {
    mockCount.mockResolvedValue(LOCKOUT_CONFIGS.LOGIN.max)
    mockFindFirst.mockResolvedValue({ createdAt: new Date() })
    const res = await checkLockout("a@b.com", "LOGIN")
    expect(res.locked).toBe(true)
  })

  it("does not lock below the max", async () => {
    mockCount.mockResolvedValue(LOCKOUT_CONFIGS.LOGIN.max - 1)
    const res = await checkLockout("a@b.com", "LOGIN")
    expect(res.locked).toBe(false)
  })

  it("fails OPEN if the DB lookup throws (availability over lockout)", async () => {
    mockCount.mockRejectedValue(new Error("db down"))
    const res = await checkLockout("a@b.com", "LOGIN")
    expect(res.locked).toBe(false)
  })
})

describe("recordAttempt", () => {
  beforeEach(() => vi.clearAllMocks())

  it("persists a normalized identifier and never throws on DB error", async () => {
    mockCreate.mockRejectedValue(new Error("db down"))
    await expect(
      recordAttempt({ identifier: "  A@B.com ", kind: "LOGIN", success: false, ipAddress: "1.2.3.4" })
    ).resolves.toBeUndefined()
  })

  it("writes the attempt with the given outcome", async () => {
    mockCreate.mockResolvedValue({})
    await recordAttempt({ identifier: "A@B.com", kind: "SIGNUP", success: true, ipAddress: "1.2.3.4" })
    const data = mockCreate.mock.calls[0][0].data
    expect(data.identifier).toBe("a@b.com")
    expect(data.kind).toBe("SIGNUP")
    expect(data.success).toBe(true)
  })
})

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" })
    expect(clientIpFromHeaders(h)).toBe("203.0.113.1")
  })

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.7" })
    expect(clientIpFromHeaders(h)).toBe("198.51.100.7")
  })

  it("returns 'unknown' when no ip header is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown")
  })
})
