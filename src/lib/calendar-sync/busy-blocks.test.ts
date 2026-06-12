import { describe, it, expect } from "vitest"
import { mergeBusyIntervals, clampToHorizon, overlapsBusy } from "./busy-blocks"
import type { BusyInterval } from "./types"

function iv(startIso: string, endIso: string): BusyInterval {
  return { start: new Date(startIso), end: new Date(endIso) }
}

describe("mergeBusyIntervals", () => {
  it("merges overlapping intervals", () => {
    const out = mergeBusyIntervals([
      iv("2026-06-15T10:00:00Z", "2026-06-15T11:00:00Z"),
      iv("2026-06-15T10:30:00Z", "2026-06-15T12:00:00Z"),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].start.toISOString()).toBe("2026-06-15T10:00:00.000Z")
    expect(out[0].end.toISOString()).toBe("2026-06-15T12:00:00.000Z")
  })

  it("merges adjacent (touching) intervals", () => {
    const out = mergeBusyIntervals([
      iv("2026-06-15T10:00:00Z", "2026-06-15T11:00:00Z"),
      iv("2026-06-15T11:00:00Z", "2026-06-15T12:00:00Z"),
    ])
    expect(out).toHaveLength(1)
  })

  it("keeps disjoint intervals separate and sorts unordered input", () => {
    const out = mergeBusyIntervals([
      iv("2026-06-15T14:00:00Z", "2026-06-15T15:00:00Z"),
      iv("2026-06-15T10:00:00Z", "2026-06-15T11:00:00Z"),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].start.toISOString()).toBe("2026-06-15T10:00:00.000Z")
  })

  it("returns empty for empty input", () => {
    expect(mergeBusyIntervals([])).toEqual([])
  })
})

describe("clampToHorizon", () => {
  const from = new Date("2026-06-15T00:00:00Z")
  const to = new Date("2026-06-16T00:00:00Z")

  it("trims an interval straddling the start edge", () => {
    const out = clampToHorizon([iv("2026-06-14T22:00:00Z", "2026-06-15T02:00:00Z")], from, to)
    expect(out[0].start.toISOString()).toBe("2026-06-15T00:00:00.000Z")
  })

  it("discards intervals fully outside the horizon", () => {
    const out = clampToHorizon([iv("2026-06-20T10:00:00Z", "2026-06-20T11:00:00Z")], from, to)
    expect(out).toHaveLength(0)
  })

  it("keeps interval fully inside untouched", () => {
    const out = clampToHorizon([iv("2026-06-15T10:00:00Z", "2026-06-15T11:00:00Z")], from, to)
    expect(out).toHaveLength(1)
  })
})

describe("overlapsBusy", () => {
  const busy = [iv("2026-06-15T10:00:00Z", "2026-06-15T11:00:00Z")]

  it("returns true when the slot is contained in a busy interval", () => {
    expect(
      overlapsBusy(new Date("2026-06-15T10:15:00Z"), new Date("2026-06-15T10:45:00Z"), busy)
    ).toBe(true)
  })

  it("edge touch does not count as overlap (half-open)", () => {
    expect(
      overlapsBusy(new Date("2026-06-15T11:00:00Z"), new Date("2026-06-15T11:30:00Z"), busy)
    ).toBe(false)
    expect(
      overlapsBusy(new Date("2026-06-15T09:30:00Z"), new Date("2026-06-15T10:00:00Z"), busy)
    ).toBe(false)
  })

  it("returns false when there is no busy interval", () => {
    expect(
      overlapsBusy(new Date("2026-06-15T10:00:00Z"), new Date("2026-06-15T11:00:00Z"), [])
    ).toBe(false)
  })
})
