import { describe, it, expect } from "vitest"
import { isOfferExpired, computeOfferExpiry, nextSequentialCandidate } from "./expiry"
import type { MatchCandidate, MatchableEntry } from "./types"

describe("isOfferExpired", () => {
  const now = new Date("2026-06-15T12:00:00.000Z")

  it("is not expired when ENVIADA and expiresAt is in the future", () => {
    expect(
      isOfferExpired({ status: "ENVIADA", expiresAt: new Date("2026-06-15T13:00:00.000Z") }, now)
    ).toBe(false)
  })

  it("is expired exactly at expiresAt (boundary)", () => {
    expect(isOfferExpired({ status: "ENVIADA", expiresAt: now }, now)).toBe(true)
  })

  it("is expired when expiresAt is in the past", () => {
    expect(
      isOfferExpired({ status: "ENVIADA", expiresAt: new Date("2026-06-15T11:00:00.000Z") }, now)
    ).toBe(true)
  })

  it("is expired when status is not ENVIADA even if expiresAt is in the future", () => {
    expect(
      isOfferExpired({ status: "ACEITA", expiresAt: new Date("2026-06-15T13:00:00.000Z") }, now)
    ).toBe(true)
  })
})

describe("computeOfferExpiry", () => {
  const now = new Date("2026-06-15T12:00:00.000Z")

  it("returns now + holdHours when the slot is far away", () => {
    const slot = new Date("2026-06-20T12:00:00.000Z")
    expect(computeOfferExpiry(now, 2, slot)).toEqual(new Date("2026-06-15T14:00:00.000Z"))
  })

  it("caps at the slot start when the slot is sooner than the hold window", () => {
    const slot = new Date("2026-06-15T13:00:00.000Z")
    expect(computeOfferExpiry(now, 2, slot)).toEqual(slot)
  })
})

describe("nextSequentialCandidate", () => {
  function candidate(id: string): MatchCandidate {
    const entry: MatchableEntry = {
      id,
      patientId: "p",
      professionalProfileId: null,
      preferences: { weekdays: [], timeRanges: [], modality: null },
      priority: 0,
      createdAt: new Date(),
    }
    return { entry, professionalMatch: false, hasSameDayAppointment: false }
  }

  it("returns the first not-yet-offered candidate", () => {
    const ranked = [candidate("a"), candidate("b"), candidate("c")]
    const next = nextSequentialCandidate(ranked, new Set(["a"]))
    expect(next?.entry.id).toBe("b")
  })

  it("returns null when all candidates were offered", () => {
    const ranked = [candidate("a"), candidate("b")]
    expect(nextSequentialCandidate(ranked, new Set(["a", "b"]))).toBeNull()
  })

  it("returns null for an empty ranked list", () => {
    expect(nextSequentialCandidate([], new Set())).toBeNull()
  })
})
