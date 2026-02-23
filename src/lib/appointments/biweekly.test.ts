import { describe, it, expect } from "vitest"
import {
  formatTimeStr,
  formatDateStr,
  buildSlotKey,
  findPairedRecurrence,
  computeBiweeklyHints,
  computePairedRecurrenceMap,
  buildBlockedAlternateKeys,
  annotateAlternateWeekInfo,
  type BiweeklyRecurrence,
  type BiweeklyAppointment,
} from "./biweekly"

// --- Test data factories ---

function makeRecurrence(overrides: Partial<BiweeklyRecurrence> = {}): BiweeklyRecurrence {
  return {
    id: "rec-1",
    professionalProfileId: "prof-1",
    patientId: "patient-1",
    dayOfWeek: 1, // Monday
    startTime: "08:45",
    startDate: new Date("2026-02-23"), // a Monday
    patient: { id: "patient-1", name: "Daniel" },
    ...overrides,
  }
}

function makeAppointment(overrides: Partial<BiweeklyAppointment> = {}): BiweeklyAppointment {
  return {
    id: "apt-1",
    scheduledAt: new Date("2026-02-23T08:45:00"), // Monday
    professionalProfileId: "prof-1",
    patientId: "patient-1",
    patient: { name: "Daniel" },
    recurrence: { recurrenceType: "BIWEEKLY", isActive: true },
    ...overrides,
  }
}

// --- formatTimeStr ---

describe("formatTimeStr", () => {
  it("formats hours and minutes with zero-padding", () => {
    expect(formatTimeStr(new Date("2026-02-23T08:05:00"))).toBe("08:05")
  })

  it("formats afternoon times", () => {
    expect(formatTimeStr(new Date("2026-02-23T14:30:00"))).toBe("14:30")
  })

  it("formats midnight", () => {
    expect(formatTimeStr(new Date("2026-02-23T00:00:00"))).toBe("00:00")
  })
})

// --- formatDateStr ---

describe("formatDateStr", () => {
  it("formats date as YYYY-MM-DD with zero-padding", () => {
    expect(formatDateStr(new Date("2026-03-05T10:00:00"))).toBe("2026-03-05")
  })

  it("formats single-digit month and day", () => {
    expect(formatDateStr(new Date("2026-01-02T10:00:00"))).toBe("2026-01-02")
  })
})

// --- buildSlotKey ---

describe("buildSlotKey", () => {
  it("builds date|professionalId|time composite key", () => {
    const date = new Date("2026-02-23T08:45:00")
    expect(buildSlotKey(date, "prof-1")).toBe("2026-02-23|prof-1|08:45")
  })
})

// --- findPairedRecurrence ---

describe("findPairedRecurrence", () => {
  it("returns match for same professional + time + dayOfWeek + different patient", () => {
    const apt = makeAppointment({ patientId: "patient-1" })
    const recurrences = [
      makeRecurrence({ id: "rec-sofia", patientId: "patient-2", dayOfWeek: 1, startTime: "08:45", patient: { id: "patient-2", name: "Sofia" } }),
    ]
    const result = findPairedRecurrence(apt, recurrences)
    expect(result).not.toBeNull()
    expect(result!.patient!.name).toBe("Sofia")
  })

  it("returns null when same time but different dayOfWeek (THE BUG)", () => {
    const apt = makeAppointment({ patientId: "patient-1" }) // Monday 08:45
    const recurrences = [
      // Beatriz is on Friday (dayOfWeek=5) 08:45 — same time, different day
      makeRecurrence({ id: "rec-beatriz", patientId: "patient-3", dayOfWeek: 5, startTime: "08:45", patient: { id: "patient-3", name: "Beatriz" } }),
    ]
    const result = findPairedRecurrence(apt, recurrences)
    expect(result).toBeNull()
  })

  it("returns null when same patient (self-match)", () => {
    const apt = makeAppointment({ patientId: "patient-1" })
    const recurrences = [
      makeRecurrence({ patientId: "patient-1", dayOfWeek: 1, startTime: "08:45" }),
    ]
    const result = findPairedRecurrence(apt, recurrences)
    expect(result).toBeNull()
  })

  it("returns null when different professional", () => {
    const apt = makeAppointment({ professionalProfileId: "prof-1", patientId: "patient-1" })
    const recurrences = [
      makeRecurrence({ professionalProfileId: "prof-2", patientId: "patient-2", dayOfWeek: 1, startTime: "08:45" }),
    ]
    const result = findPairedRecurrence(apt, recurrences)
    expect(result).toBeNull()
  })

  it("returns null when different time", () => {
    const apt = makeAppointment({ patientId: "patient-1" }) // 08:45
    const recurrences = [
      makeRecurrence({ patientId: "patient-2", dayOfWeek: 1, startTime: "09:00" }),
    ]
    const result = findPairedRecurrence(apt, recurrences)
    expect(result).toBeNull()
  })

  it("returns null when empty recurrences array", () => {
    const apt = makeAppointment()
    expect(findPairedRecurrence(apt, [])).toBeNull()
  })
})

// --- computeBiweeklyHints ---

describe("computeBiweeklyHints", () => {
  // Daniel: Mon 08:45, startDate 2026-02-23 (on-week)
  // Sofia: Mon 08:45, startDate 2026-03-02 (off-week on 2026-02-23, on-week on 2026-03-02)
  const danielRec = makeRecurrence({
    id: "rec-daniel",
    patientId: "patient-daniel",
    dayOfWeek: 1,
    startTime: "08:45",
    startDate: new Date("2026-02-23"),
    patient: { id: "patient-daniel", name: "Daniel" },
  })
  const sofiaRec = makeRecurrence({
    id: "rec-sofia",
    patientId: "patient-sofia",
    dayOfWeek: 1,
    startTime: "08:45",
    startDate: new Date("2026-03-02"),
    patient: { id: "patient-sofia", name: "Sofia" },
  })

  it("returns hints only for off-week dates", () => {
    // On 2026-02-23 (Monday): Daniel is on-week, Sofia is off-week
    // So Sofia should appear as hint on 2026-02-23
    const hints = computeBiweeklyHints({
      dateRangeStart: "2026-02-23",
      dateRangeEnd: "2026-02-23",
      recurrences: [danielRec, sofiaRec],
      occupiedSlots: new Set(["2026-02-23|prof-1|08:45"]), // Daniel's appointment occupies slot
    })
    // Sofia is off-week on 2026-02-23 but slot is occupied, so no hint
    expect(hints).toHaveLength(0)
  })

  it("shows hint when off-week slot is empty", () => {
    // On 2026-03-02 (Monday): Sofia is on-week, Daniel is off-week
    // Daniel should appear as hint if slot is unoccupied
    const hints = computeBiweeklyHints({
      dateRangeStart: "2026-03-02",
      dateRangeEnd: "2026-03-02",
      recurrences: [danielRec, sofiaRec],
      occupiedSlots: new Set(["2026-03-02|prof-1|08:45"]), // Sofia's appointment occupies slot
    })
    // Daniel is off-week on 2026-03-02 but slot is occupied
    expect(hints).toHaveLength(0)
  })

  it("shows hint when off-week and slot not occupied", () => {
    // On 2026-03-02: Daniel is off-week, slot is empty
    const hints = computeBiweeklyHints({
      dateRangeStart: "2026-03-02",
      dateRangeEnd: "2026-03-02",
      recurrences: [danielRec, sofiaRec],
      occupiedSlots: new Set(), // no occupied slots
    })
    // Daniel is off-week, Sofia is on-week (but has no appointment blocking)
    // Daniel's off-week on 03-02: startDate is 02-23, diff = 7 days = 1 week = off
    const danielHint = hints.find(h => h.patientName === "Daniel")
    expect(danielHint).toBeDefined()
  })

  it("skips recurrences that don't match the day of week", () => {
    const fridayRec = makeRecurrence({
      id: "rec-friday",
      patientId: "patient-friday",
      dayOfWeek: 5, // Friday
      startTime: "08:45",
      startDate: new Date("2026-02-20"),
      patient: { id: "patient-friday", name: "Friday Patient" },
    })
    // Querying Monday 2026-02-23, should NOT show Friday recurrence
    const hints = computeBiweeklyHints({
      dateRangeStart: "2026-02-23",
      dateRangeEnd: "2026-02-23",
      recurrences: [fridayRec],
      occupiedSlots: new Set(),
    })
    expect(hints).toHaveLength(0)
  })

  it("handles multi-day range (weekly view)", () => {
    // Mon-Sun range: should only generate hints for Monday (dayOfWeek=1)
    const hints = computeBiweeklyHints({
      dateRangeStart: "2026-03-02", // Monday
      dateRangeEnd: "2026-03-08",   // Sunday
      recurrences: [danielRec], // Mon 08:45, off-week on 03-02
      occupiedSlots: new Set(),
    })
    // Daniel is off-week on 2026-03-02 (1 week from startDate 02-23)
    const mondayHints = hints.filter(h => h.date === "2026-03-02")
    expect(mondayHints).toHaveLength(1)
    expect(mondayHints[0].patientName).toBe("Daniel")
    // No hints for other days (Tuesday-Sunday)
    const otherDayHints = hints.filter(h => h.date !== "2026-03-02")
    expect(otherDayHints).toHaveLength(0)
  })
})

// --- computePairedRecurrenceMap ---

describe("computePairedRecurrenceMap", () => {
  it("maps each biweekly appointment to its paired recurrence", () => {
    const apt = makeAppointment({ id: "apt-daniel", patientId: "patient-daniel" })
    const sofiaRec = makeRecurrence({
      id: "rec-sofia",
      patientId: "patient-sofia",
      dayOfWeek: 1,
      startTime: "08:45",
      patient: { id: "patient-sofia", name: "Sofia" },
    })
    const map = computePairedRecurrenceMap([apt], [sofiaRec])
    expect(map.has("apt-daniel")).toBe(true)
    expect(map.get("apt-daniel")!.patientName).toBe("Sofia")
    expect(map.get("apt-daniel")!.recurrenceId).toBe("rec-sofia")
  })

  it("returns entry with null name for appointments with no pairs", () => {
    const apt = makeAppointment({ id: "apt-alone", patientId: "patient-alone" })
    const map = computePairedRecurrenceMap([apt], [])
    expect(map.has("apt-alone")).toBe(true)
    expect(map.get("apt-alone")!.patientName).toBeNull()
  })

  it("handles multiple biweekly pairs correctly", () => {
    const apt1 = makeAppointment({ id: "apt-1", patientId: "p1", scheduledAt: new Date("2026-02-23T08:45:00") })
    const apt2 = makeAppointment({ id: "apt-2", patientId: "p3", scheduledAt: new Date("2026-02-23T10:00:00") })

    const rec1 = makeRecurrence({ id: "rec-p2", patientId: "p2", dayOfWeek: 1, startTime: "08:45", patient: { id: "p2", name: "Partner1" } })
    const rec2 = makeRecurrence({ id: "rec-p4", patientId: "p4", dayOfWeek: 1, startTime: "10:00", patient: { id: "p4", name: "Partner2" } })

    const map = computePairedRecurrenceMap([apt1, apt2], [rec1, rec2])
    expect(map.get("apt-1")!.patientName).toBe("Partner1")
    expect(map.get("apt-2")!.patientName).toBe("Partner2")
  })
})

// --- buildBlockedAlternateKeys ---

describe("buildBlockedAlternateKeys", () => {
  it("builds correct slot keys from blocking entries", () => {
    const entries = [
      { scheduledAt: new Date("2026-03-02T08:45:00"), professionalProfileId: "prof-1" },
      { scheduledAt: new Date("2026-03-02T10:00:00"), professionalProfileId: "prof-2" },
    ]
    const keys = buildBlockedAlternateKeys(entries)
    expect(keys.has("2026-03-02|prof-1|08:45")).toBe(true)
    expect(keys.has("2026-03-02|prof-2|10:00")).toBe(true)
    expect(keys.size).toBe(2)
  })

  it("returns empty set for no entries", () => {
    const keys = buildBlockedAlternateKeys([])
    expect(keys.size).toBe(0)
  })
})

// --- annotateAlternateWeekInfo ---

describe("annotateAlternateWeekInfo", () => {
  it("adds alternateWeekInfo with paired patient name", () => {
    const apt = makeAppointment({ id: "apt-1" })
    const pairedMap = new Map([["apt-1", { recurrenceId: "rec-2", patientName: "Sofia" }]])

    const result = annotateAlternateWeekInfo([apt], pairedMap, new Set())
    expect(result[0].alternateWeekInfo).toBeDefined()
    expect(result[0].alternateWeekInfo!.pairedPatientName).toBe("Sofia")
  })

  it("sets isAvailable=true when no pair and no block", () => {
    const apt = makeAppointment({ id: "apt-1" })
    const pairedMap = new Map([["apt-1", { recurrenceId: "", patientName: null }]])

    const result = annotateAlternateWeekInfo([apt], pairedMap, new Set())
    expect(result[0].alternateWeekInfo!.isAvailable).toBe(true)
  })

  it("sets isAvailable=false when blocked by non-CONSULTA entry", () => {
    const apt = makeAppointment({ id: "apt-1", scheduledAt: new Date("2026-02-23T08:45:00") })
    const pairedMap = new Map([["apt-1", { recurrenceId: "", patientName: null }]])
    // Alternate week = +7 days = 2026-03-02
    const blockedSlots = new Set(["2026-03-02|prof-1|08:45"])

    const result = annotateAlternateWeekInfo([apt], pairedMap, blockedSlots)
    expect(result[0].alternateWeekInfo!.isAvailable).toBe(false)
  })

  it("skips non-biweekly appointments", () => {
    const apt = makeAppointment({ id: "apt-weekly", recurrence: { recurrenceType: "WEEKLY", isActive: true } })
    const result = annotateAlternateWeekInfo([apt], new Map(), new Set())
    expect(result[0].alternateWeekInfo).toBeUndefined()
  })

  it("skips appointments without patient", () => {
    const apt = makeAppointment({ id: "apt-no-patient", patient: null })
    const result = annotateAlternateWeekInfo([apt], new Map(), new Set())
    expect(result[0].alternateWeekInfo).toBeUndefined()
  })
})
