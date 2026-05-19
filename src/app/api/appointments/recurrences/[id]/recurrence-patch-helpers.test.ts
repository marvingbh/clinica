import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockCheckConflictsBulk = vi.fn()
vi.mock("@/lib/appointments/conflict-check", () => ({
  checkConflictsBulk: (...args: unknown[]) => mockCheckConflictsBulk(...args),
}))

import { prepareDayShift } from "./recurrence-patch-helpers"

function makeApt(id: string, isoDate: string) {
  const scheduledAt = new Date(isoDate)
  const endAt = new Date(scheduledAt.getTime() + 45 * 60 * 1000)
  return { id, scheduledAt, endAt }
}

describe("prepareDayShift", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Frozen "today" so the past-protection logic is deterministic.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-19T12:00:00"))
    mockCheckConflictsBulk.mockResolvedValue({ conflicts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shifts Thu future appointments forward to the next Tue when shifting back lands in the past", async () => {
    // Today = 2026-05-19. Appointment on Thu 2026-05-21 17:00 shifted to
    // Tuesday: the nearest Tue is 2026-05-19 (TODAY/past hours). Without
    // the guard this collides with anything booked today. The guard pushes
    // it to 2026-05-26 instead.
    const apt = makeApt("apt-1", "2026-05-21T17:00:00")
    const result = await prepareDayShift({
      appointments: [apt],
      newDayOfWeek: 2, // Tuesday
      currentStartTime: "17:00",
      currentEndTime: "17:45",
      professionalProfileId: "prof-1",
      additionalProfessionalIds: [],
    })
    expect("shifted" in result).toBe(true)
    if ("shifted" in result) {
      const shifted = result.shifted[0]
      expect(shifted.newScheduledAt.toISOString().slice(0, 10)).toBe("2026-05-26")
    }
  })

  it("keeps the standard +2/-2 nearest-day shift when the target lands cleanly in the future", async () => {
    // Today = 2026-05-19. Thu 2026-06-18 → Tue is 2 days back: 2026-06-16
    // (future, no clamp needed).
    const apt = makeApt("apt-2", "2026-06-18T17:00:00")
    const result = await prepareDayShift({
      appointments: [apt],
      newDayOfWeek: 2,
      currentStartTime: "17:00",
      currentEndTime: "17:45",
      professionalProfileId: "prof-1",
      additionalProfessionalIds: [],
    })
    expect("shifted" in result).toBe(true)
    if ("shifted" in result) {
      expect(result.shifted[0].newScheduledAt.toISOString().slice(0, 10)).toBe("2026-06-16")
    }
  })

  it("only sends future-safe shifted dates to checkConflictsBulk (no phantom past collisions)", async () => {
    // The bug: a Thu→Tue shift moved 21/05 to 19/05 (today), then asked
    // checkConflictsBulk if 19/05 17:00 collided with anything — and it did
    // (with May events). The fix ensures only the future-clamped date is
    // sent, so the May conflicts never surface.
    await prepareDayShift({
      appointments: [makeApt("apt-1", "2026-05-21T17:00:00")],
      newDayOfWeek: 2,
      currentStartTime: "17:00",
      currentEndTime: "17:45",
      professionalProfileId: "prof-1",
      additionalProfessionalIds: [],
    })
    const sentDates = mockCheckConflictsBulk.mock.calls[0][0].dates
    expect(sentDates).toHaveLength(1)
    const isoDay = sentDates[0].scheduledAt.toISOString().slice(0, 10)
    expect(isoDay).toBe("2026-05-26")
    expect(isoDay >= "2026-05-19").toBe(true)
  })

  it("does not shift an appointment that is already on the target weekday", async () => {
    // 2026-06-02 is a Tuesday; shifting to Tuesday is a no-op.
    const apt = makeApt("apt-3", "2026-06-02T17:00:00")
    const result = await prepareDayShift({
      appointments: [apt],
      newDayOfWeek: 2,
      currentStartTime: "17:00",
      currentEndTime: "17:45",
      professionalProfileId: "prof-1",
      additionalProfessionalIds: [],
    })
    if ("shifted" in result) {
      expect(result.shifted[0].newScheduledAt.toISOString().slice(0, 10)).toBe("2026-06-02")
    }
  })
})
