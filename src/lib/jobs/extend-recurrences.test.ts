import { describe, it, expect } from "vitest"
import {
  needsExtension,
  filterExceptions,
  filterConflicts,
  buildAppointmentData,
  type DateInfo,
  type RecurrenceInfo,
} from "./extend-recurrences"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDateInfo(
  dateStr: string,
  hour: number = 9,
  durationMin: number = 50
): DateInfo {
  const scheduledAt = new Date(
    `${dateStr}T${String(hour).padStart(2, "0")}:00:00`
  )
  const endAt = new Date(scheduledAt.getTime() + durationMin * 60 * 1000)
  return { date: dateStr, scheduledAt, endAt }
}

function makeExisting(
  dateStr: string,
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number
) {
  return {
    scheduledAt: new Date(
      `${dateStr}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00`
    ),
    endAt: new Date(
      `${dateStr}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`
    ),
  }
}

function makeRecurrence(
  overrides: Partial<RecurrenceInfo> = {}
): RecurrenceInfo {
  return {
    id: "rec-1",
    clinicId: "clinic-1",
    professionalProfileId: "prof-1",
    patientId: "patient-1",
    modality: "PRESENCIAL",
    ...overrides,
  }
}

// ── needsExtension ───────────────────────────────────────────────────────────

describe("needsExtension", () => {
  const now = new Date("2026-04-14T10:00:00")

  it("returns true when lastGeneratedDate is before 2 months from now", () => {
    const lastGen = new Date("2026-05-01")
    expect(needsExtension(lastGen, new Date("2026-01-01"), now)).toBe(true)
  })

  it("returns false when lastGeneratedDate is more than 2 months from now", () => {
    const lastGen = new Date("2026-07-01")
    expect(needsExtension(lastGen, new Date("2026-01-01"), now)).toBe(false)
  })

  it("returns true when lastGeneratedDate is exactly 2 months from now", () => {
    const twoMonths = new Date(now)
    twoMonths.setMonth(twoMonths.getMonth() + 2)
    expect(needsExtension(twoMonths, new Date("2026-01-01"), now)).toBe(true)
  })

  it("falls back to startDate when lastGeneratedDate is null", () => {
    const startDate = new Date("2026-03-01")
    expect(needsExtension(null, startDate, now)).toBe(true)
  })

  it("falls back to startDate and returns false when startDate is far future", () => {
    const startDate = new Date("2026-12-01")
    expect(needsExtension(null, startDate, now)).toBe(false)
  })

  it("returns true when lastGeneratedDate is in the past", () => {
    const lastGen = new Date("2026-01-01")
    expect(needsExtension(lastGen, new Date("2026-01-01"), now)).toBe(true)
  })
})

// ── filterExceptions ─────────────────────────────────────────────────────────

describe("filterExceptions", () => {
  it("removes dates that appear in the exceptions list", () => {
    const dates = [
      makeDateInfo("2026-04-20"),
      makeDateInfo("2026-04-27"),
      makeDateInfo("2026-05-04"),
    ]
    const result = filterExceptions(dates, ["2026-04-20", "2026-05-04"])
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe("2026-04-27")
  })

  it("returns all dates when exceptions list is empty", () => {
    const dates = [makeDateInfo("2026-04-20"), makeDateInfo("2026-04-27")]
    const result = filterExceptions(dates, [])
    expect(result).toHaveLength(2)
  })

  it("returns empty array when all dates are exceptions", () => {
    const dates = [makeDateInfo("2026-04-20"), makeDateInfo("2026-04-27")]
    const result = filterExceptions(dates, ["2026-04-20", "2026-04-27"])
    expect(result).toHaveLength(0)
  })

  it("handles exceptions that do not match any date", () => {
    const dates = [makeDateInfo("2026-04-20")]
    const result = filterExceptions(dates, ["2026-12-25"])
    expect(result).toHaveLength(1)
  })

  it("returns empty array when dates list is empty", () => {
    const result = filterExceptions([], ["2026-04-20"])
    expect(result).toHaveLength(0)
  })
})

// ── filterConflicts ──────────────────────────────────────────────────────────

describe("filterConflicts", () => {
  it("removes dates that overlap with existing appointments", () => {
    const dates = [
      makeDateInfo("2026-04-20", 9, 50), // 09:00-09:50
      makeDateInfo("2026-04-27", 9, 50), // 09:00-09:50
    ]
    // Overlap with first date: existing 09:30-10:20 overlaps 09:00-09:50
    const existing = [makeExisting("2026-04-20", 9, 30, 10, 20)]
    const result = filterConflicts(dates, existing, 0)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe("2026-04-27")
  })

  it("keeps dates that do not overlap", () => {
    const dates = [makeDateInfo("2026-04-20", 9, 50)] // 09:00-09:50
    // Existing at 11:00-11:50, no overlap
    const existing = [makeExisting("2026-04-20", 11, 0, 11, 50)]
    const result = filterConflicts(dates, existing, 0)
    expect(result).toHaveLength(1)
  })

  it("respects bufferMinutes for conflict detection", () => {
    const dates = [makeDateInfo("2026-04-20", 9, 50)] // 09:00-09:50
    // Existing at 10:00-10:50. Without buffer: no conflict (09:50 <= 10:00).
    // With 15min buffer: existingStart-buffer=09:45, existingEnd+buffer=11:05
    // New 09:00-09:50: newStart(09:00) < existingEnd+buffer(11:05) AND newEnd(09:50) > existingStart-buffer(09:45) => conflict
    const existing = [makeExisting("2026-04-20", 10, 0, 10, 50)]
    const result = filterConflicts(dates, existing, 15)
    expect(result).toHaveLength(0)
  })

  it("does not flag conflict without buffer when adjacent", () => {
    const dates = [makeDateInfo("2026-04-20", 9, 50)] // 09:00-09:50
    // Existing at 09:50-10:40: right after, no overlap
    const existing = [makeExisting("2026-04-20", 9, 50, 10, 40)]
    const result = filterConflicts(dates, existing, 0)
    expect(result).toHaveLength(1)
  })

  it("returns all dates when there are no existing appointments", () => {
    const dates = [
      makeDateInfo("2026-04-20"),
      makeDateInfo("2026-04-27"),
    ]
    const result = filterConflicts(dates, [], 0)
    expect(result).toHaveLength(2)
  })

  it("returns empty array when all dates conflict", () => {
    const dates = [makeDateInfo("2026-04-20", 9, 50)] // 09:00-09:50
    // Exact overlap
    const existing = [makeExisting("2026-04-20", 9, 0, 9, 50)]
    const result = filterConflicts(dates, existing, 0)
    expect(result).toHaveLength(0)
  })

  it("handles buffer of 0 correctly", () => {
    const dates = [makeDateInfo("2026-04-20", 9, 50)] // 09:00-09:50
    const existing = [makeExisting("2026-04-20", 10, 0, 10, 50)]
    const result = filterConflicts(dates, existing, 0)
    expect(result).toHaveLength(1)
  })
})

// ── buildAppointmentData ─────────────────────────────────────────────────────

describe("buildAppointmentData", () => {
  it("maps dates to appointment creation objects with correct fields", () => {
    const dates = [makeDateInfo("2026-04-20", 9, 50)]
    const recurrence = makeRecurrence({
      id: "rec-42",
      clinicId: "clinic-7",
      professionalProfileId: "prof-3",
      patientId: "patient-5",
      modality: "ONLINE",
    })

    const result = buildAppointmentData(dates, recurrence)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      clinicId: "clinic-7",
      professionalProfileId: "prof-3",
      patientId: "patient-5",
      recurrenceId: "rec-42",
      scheduledAt: dates[0].scheduledAt,
      endAt: dates[0].endAt,
      modality: "ONLINE",
      status: "AGENDADO",
    })
  })

  it("handles multiple dates", () => {
    const dates = [
      makeDateInfo("2026-04-20"),
      makeDateInfo("2026-04-27"),
      makeDateInfo("2026-05-04"),
    ]
    const recurrence = makeRecurrence()
    const result = buildAppointmentData(dates, recurrence)
    expect(result).toHaveLength(3)
    expect(result[0].scheduledAt).toEqual(dates[0].scheduledAt)
    expect(result[1].scheduledAt).toEqual(dates[1].scheduledAt)
    expect(result[2].scheduledAt).toEqual(dates[2].scheduledAt)
  })

  it("returns empty array for empty dates", () => {
    const result = buildAppointmentData([], makeRecurrence())
    expect(result).toHaveLength(0)
  })

  it("handles null patientId (group or non-CONSULTA)", () => {
    const dates = [makeDateInfo("2026-04-20")]
    const recurrence = makeRecurrence({ patientId: null })
    const result = buildAppointmentData(dates, recurrence)
    expect(result[0].patientId).toBeNull()
  })

  it("always sets status to AGENDADO", () => {
    const dates = [makeDateInfo("2026-04-20"), makeDateInfo("2026-04-27")]
    const recurrence = makeRecurrence()
    const result = buildAppointmentData(dates, recurrence)
    result.forEach((item) => {
      expect(item.status).toBe("AGENDADO")
    })
  })

  it("preserves recurrenceId from the recurrence", () => {
    const dates = [makeDateInfo("2026-04-20")]
    const recurrence = makeRecurrence({ id: "rec-special" })
    const result = buildAppointmentData(dates, recurrence)
    expect(result[0].recurrenceId).toBe("rec-special")
  })
})
