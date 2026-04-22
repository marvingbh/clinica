import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkInMemory, __resetMemoryStore } from "./rate-limit-memory"

describe("checkInMemory", () => {
  beforeEach(() => {
    __resetMemoryStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows up to maxRequests then blocks", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkInMemory("k", 3, 60_000).allowed).toBe(true)
    }
    expect(checkInMemory("k", 3, 60_000).allowed).toBe(false)
  })

  it("isolates counters by key", () => {
    checkInMemory("a", 1, 60_000)
    expect(checkInMemory("a", 1, 60_000).allowed).toBe(false)
    expect(checkInMemory("b", 1, 60_000).allowed).toBe(true)
  })

  it("decays entries as the window slides", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    checkInMemory("k", 2, 60_000)
    checkInMemory("k", 2, 60_000)
    expect(checkInMemory("k", 2, 60_000).allowed).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(checkInMemory("k", 2, 60_000).allowed).toBe(true)
  })
})
