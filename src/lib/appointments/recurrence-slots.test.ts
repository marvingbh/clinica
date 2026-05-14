import { describe, it, expect } from "vitest"
import {
  getIsoWeek,
  getBiweeklyParity,
  getWeekOfMonth,
  formatFrequencyTag,
  formatFrequencyLabel,
  classifyRecurrenceKind,
  groupRecurrencesIntoSlots,
  pairBiweekly,
  computeWeeklyFreeSlots,
  type RecurrenceForSlot,
} from "./recurrence-slots"

function makeRow(overrides: Partial<RecurrenceForSlot> = {}): RecurrenceForSlot {
  return {
    id: "r1",
    type: "CONSULTA",
    title: null,
    recurrenceType: "WEEKLY",
    dayOfWeek: 1,
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    startDate: "2026-05-04",
    endDate: null,
    professionalProfileId: "p1",
    professionalName: "Ana",
    patientId: "pt1",
    patientName: "Maria",
    additionalProfessionalIds: [],
    ...overrides,
  }
}

describe("getIsoWeek", () => {
  it("returns 1 for 2026-01-01 (Thursday) — first ISO week of 2026", () => {
    expect(getIsoWeek("2026-01-01")).toBe(1)
  })

  it("returns 53 for 2026-12-31 when it falls in the last ISO week of the year", () => {
    // 2026-12-31 is a Thursday → ISO week 53 of 2026.
    expect(getIsoWeek("2026-12-31")).toBe(53)
  })

  it("returns the same week number for all days in that ISO week", () => {
    expect(getIsoWeek("2026-05-11")).toBe(getIsoWeek("2026-05-15")) // Mon..Fri same week
  })
})

describe("getBiweeklyParity", () => {
  it("returns par for an even ISO week", () => {
    // 2026-05-04 is in ISO week 19 (odd) — Mon May 4 belongs to week 19.
    // Pick a date in an even week:
    expect(getBiweeklyParity("2026-05-11")).toBe("par") // ISO week 20
  })

  it("returns impar for an odd ISO week", () => {
    expect(getBiweeklyParity("2026-05-04")).toBe("impar") // ISO week 19
  })

  it("handles year-boundary 2025-12-29 (ISO week 1 of 2026)", () => {
    // Dec 29 2025 is Monday of ISO week 1 of 2026 → odd → impar
    expect(getBiweeklyParity("2025-12-29")).toBe("impar")
  })
})

describe("getWeekOfMonth", () => {
  it("returns 1 for day 1", () => {
    expect(getWeekOfMonth("2026-05-01")).toBe(1)
  })

  it("returns 1 for day 7", () => {
    expect(getWeekOfMonth("2026-05-07")).toBe(1)
  })

  it("returns 2 for day 8", () => {
    expect(getWeekOfMonth("2026-05-08")).toBe(2)
  })

  it("returns 4 for day 28", () => {
    expect(getWeekOfMonth("2026-05-28")).toBe(4)
  })

  it("returns 5 for day 31", () => {
    expect(getWeekOfMonth("2026-05-31")).toBe(5)
  })
})

describe("formatFrequencyTag", () => {
  it("returns S for WEEKLY", () => {
    expect(formatFrequencyTag("WEEKLY")).toBe("S")
  })
  it("returns Q for BIWEEKLY", () => {
    expect(formatFrequencyTag("BIWEEKLY")).toBe("Q")
  })
  it("returns M for MONTHLY", () => {
    expect(formatFrequencyTag("MONTHLY")).toBe("M")
  })
})

describe("formatFrequencyLabel", () => {
  it("returns Portuguese short labels", () => {
    expect(formatFrequencyLabel("WEEKLY")).toBe("Sem")
    expect(formatFrequencyLabel("BIWEEKLY")).toBe("Quinz")
    expect(formatFrequencyLabel("MONTHLY")).toBe("Mens")
  })
})

describe("classifyRecurrenceKind", () => {
  it("returns the frequency kind for CONSULTA recurrences", () => {
    expect(classifyRecurrenceKind(makeRow({ type: "CONSULTA", recurrenceType: "WEEKLY" }))).toBe("weekly")
    expect(classifyRecurrenceKind(makeRow({ type: "CONSULTA", recurrenceType: "BIWEEKLY" }))).toBe("biweekly")
    expect(classifyRecurrenceKind(makeRow({ type: "CONSULTA", recurrenceType: "MONTHLY" }))).toBe("monthly")
  })
  it("returns 'block' for non-CONSULTA recurrences (supervisão/terapia/reunião)", () => {
    expect(classifyRecurrenceKind(makeRow({ type: "REUNIAO" }))).toBe("block")
    expect(classifyRecurrenceKind(makeRow({ type: "TAREFA" }))).toBe("block")
  })
})

describe("computeWeeklyFreeSlots", () => {
  const rule = (dayOfWeek: number, startTime: string, endTime: string) => ({
    dayOfWeek,
    startTime,
    endTime,
    isActive: true,
  })

  it("returns all aligned slots when there are no recurrences", () => {
    const free = computeWeeklyFreeSlots([rule(1, "09:00", "10:30")], [], 30)
    expect(free).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "09:30" },
      { dayOfWeek: 1, startTime: "09:30", endTime: "10:00" },
      { dayOfWeek: 1, startTime: "10:00", endTime: "10:30" },
    ])
  })

  it("excludes slots that overlap any recurrence on that weekday", () => {
    const rec = makeRow({ id: "r", dayOfWeek: 1, startTime: "09:30", endTime: "10:00" })
    const free = computeWeeklyFreeSlots([rule(1, "09:00", "11:00")], [rec], 30)
    expect(free.map((s) => s.startTime)).toEqual(["09:00", "10:00", "10:30"])
  })

  it("ignores inactive rules", () => {
    const free = computeWeeklyFreeSlots(
      [{ dayOfWeek: 1, startTime: "09:00", endTime: "10:00", isActive: false }],
      [],
      30,
    )
    expect(free).toEqual([])
  })

  it("does not emit a partial trailing slot when the rule ends mid-cadence", () => {
    const free = computeWeeklyFreeSlots([rule(1, "09:00", "10:15")], [], 30)
    expect(free.map((s) => s.startTime)).toEqual(["09:00", "09:30"])
  })

  it("a biweekly with only one parity filled still occupies the slot for new weeklies", () => {
    const par = makeRow({ id: "p", dayOfWeek: 1, startTime: "10:00", endTime: "10:50", recurrenceType: "BIWEEKLY" })
    const free = computeWeeklyFreeSlots([rule(1, "10:00", "11:00")], [par], 50)
    expect(free).toEqual([]) // no full 50-min weekly fits
  })
})

describe("groupRecurrencesIntoSlots", () => {
  it("groups by (dayOfWeek, startTime)", () => {
    const rows = [
      makeRow({ id: "a", dayOfWeek: 1, startTime: "08:00", endTime: "09:00" }),
      makeRow({ id: "b", dayOfWeek: 1, startTime: "08:00", endTime: "09:00" }),
      makeRow({ id: "c", dayOfWeek: 2, startTime: "08:00", endTime: "09:00" }),
    ]
    const groups = groupRecurrencesIntoSlots(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].recurrences.map((r) => r.id)).toEqual(["a", "b"])
    expect(groups[1].recurrences.map((r) => r.id)).toEqual(["c"])
  })

  it("sorts groups by weekday then startTime", () => {
    const rows = [
      makeRow({ id: "x", dayOfWeek: 3, startTime: "10:00" }),
      makeRow({ id: "y", dayOfWeek: 1, startTime: "12:00" }),
      makeRow({ id: "z", dayOfWeek: 1, startTime: "08:00" }),
    ]
    const groups = groupRecurrencesIntoSlots(rows)
    expect(groups.map((g) => g.recurrences[0].id)).toEqual(["z", "y", "x"])
  })

  it("merges across professionals when dayOfWeek+startTime match (Todos mode)", () => {
    const rows = [
      makeRow({ id: "a", professionalProfileId: "p1" }),
      makeRow({ id: "b", professionalProfileId: "p2" }),
    ]
    const groups = groupRecurrencesIntoSlots(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].recurrences).toHaveLength(2)
  })

  it("merges recurrences sharing a start time even when end times differ", () => {
    const rows = [
      makeRow({ id: "a", startTime: "09:00", endTime: "09:50" }),
      makeRow({ id: "b", startTime: "09:00", endTime: "10:00" }),
    ]
    const groups = groupRecurrencesIntoSlots(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].recurrences).toHaveLength(2)
    expect(groups[0].endTime).toBe("10:00") // latest end
  })

  it("keeps non-hourly starts (08:45) as their own slot", () => {
    const rows = [
      makeRow({ id: "a", startTime: "08:00", endTime: "08:50" }),
      makeRow({ id: "b", startTime: "08:45", endTime: "09:35" }),
    ]
    const groups = groupRecurrencesIntoSlots(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].startTime).toBe("08:00")
    expect(groups[1].startTime).toBe("08:45")
  })
})

describe("pairBiweekly", () => {
  it("returns par + impar when both parities are present", () => {
    const par = makeRow({
      id: "p",
      recurrenceType: "BIWEEKLY",
      startDate: "2026-05-11", // ISO week 20 → par
    })
    const impar = makeRow({
      id: "i",
      recurrenceType: "BIWEEKLY",
      startDate: "2026-05-04", // ISO week 19 → impar
    })
    const pair = pairBiweekly([par, impar])
    expect(pair.par?.id).toBe("p")
    expect(pair.impar?.id).toBe("i")
    expect(pair.conflict).toBe(false)
  })

  it("leaves the missing parity null when only one is present", () => {
    const par = makeRow({
      id: "p",
      recurrenceType: "BIWEEKLY",
      startDate: "2026-05-11",
    })
    const pair = pairBiweekly([par])
    expect(pair.par?.id).toBe("p")
    expect(pair.impar).toBeNull()
    expect(pair.conflict).toBe(false)
  })

  it("flags conflict when two biweeklies share the same parity, keeping the earlier startDate", () => {
    const earlier = makeRow({
      id: "earlier",
      recurrenceType: "BIWEEKLY",
      startDate: "2026-05-11", // par
    })
    const later = makeRow({
      id: "later",
      recurrenceType: "BIWEEKLY",
      startDate: "2026-05-25", // also par
    })
    const pair = pairBiweekly([later, earlier])
    expect(pair.par?.id).toBe("earlier")
    expect(pair.conflict).toBe(true)
  })

  it("ignores non-biweekly rows in the input", () => {
    const weekly = makeRow({ id: "w", recurrenceType: "WEEKLY" })
    const bi = makeRow({
      id: "b",
      recurrenceType: "BIWEEKLY",
      startDate: "2026-05-11",
    })
    const pair = pairBiweekly([weekly, bi])
    expect(pair.par?.id).toBe("b")
    expect(pair.impar).toBeNull()
  })
})
