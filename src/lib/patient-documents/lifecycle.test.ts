import { describe, it, expect, vi, afterEach } from "vitest"
import {
  isPurgeEligible,
  purgeDeadline,
  findOrphanKeys,
  TRASH_RETENTION_DAYS,
} from "./lifecycle"
import type { StoredObject } from "@/lib/storage"

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

afterEach(() => {
  vi.useRealTimers()
})

describe("isPurgeEligible", () => {
  it("is false for null deletedAt", () => {
    expect(isPurgeEligible(null, new Date())).toBe(false)
  })

  it("is false at 29 days", () => {
    const now = new Date("2026-02-01T00:00:00Z")
    const deletedAt = new Date(now.getTime() - 29 * DAY_MS)
    expect(isPurgeEligible(deletedAt, now)).toBe(false)
  })

  it("is true at 30 days + 1 second", () => {
    const now = new Date("2026-02-01T00:00:00Z")
    const deletedAt = new Date(now.getTime() - (30 * DAY_MS + 1000))
    expect(isPurgeEligible(deletedAt, now)).toBe(true)
  })

  it("uses the current time when now is omitted (fake timers)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"))
    const deletedAt = new Date(Date.now() - 31 * DAY_MS)
    expect(isPurgeEligible(deletedAt)).toBe(true)
  })
})

describe("purgeDeadline", () => {
  it("is deletedAt + 30 days", () => {
    const deletedAt = new Date("2026-01-01T00:00:00Z")
    const deadline = purgeDeadline(deletedAt)
    expect(deadline.getTime()).toBe(
      deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS
    )
  })
})

describe("findOrphanKeys", () => {
  const now = new Date("2026-02-01T00:00:00Z")
  function blob(key: string, ageHours: number): StoredObject {
    return { key, sizeBytes: 100, uploadedAt: new Date(now.getTime() - ageHours * HOUR_MS) }
  }

  it("flags a blob with no row older than the grace window", () => {
    const orphans = findOrphanKeys([blob("a", 25)], new Set<string>(), now)
    expect(orphans).toEqual(["a"])
  })

  it("does not flag a blob younger than the grace window", () => {
    const orphans = findOrphanKeys([blob("a", 1)], new Set<string>(), now)
    expect(orphans).toEqual([])
  })

  it("does not flag a blob that has a row", () => {
    const orphans = findOrphanKeys([blob("a", 100)], new Set(["a"]), now)
    expect(orphans).toEqual([])
  })

  it("flags only the orphaned subset", () => {
    const orphans = findOrphanKeys(
      [blob("old-orphan", 48), blob("known", 48), blob("fresh", 2)],
      new Set(["known"]),
      now
    )
    expect(orphans).toEqual(["old-orphan"])
  })
})
