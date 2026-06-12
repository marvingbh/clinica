import { describe, it, expect } from "vitest"
import { parsePreferences } from "./preferences"

describe("parsePreferences", () => {
  it("parses a valid full object", () => {
    const result = parsePreferences({
      weekdays: [1, 3],
      timeRanges: [{ start: "18:00", end: "21:00" }],
      modality: "ONLINE",
    })
    expect(result).toEqual({
      weekdays: [1, 3],
      timeRanges: [{ start: "18:00", end: "21:00" }],
      modality: "ONLINE",
    })
  })

  it("falls back to 'accepts anything' for empty object", () => {
    expect(parsePreferences({})).toEqual({
      weekdays: [],
      timeRanges: [],
      modality: null,
    })
  })

  it("falls back to 'accepts anything' for null", () => {
    expect(parsePreferences(null)).toEqual({
      weekdays: [],
      timeRanges: [],
      modality: null,
    })
  })

  it("falls back for invalid json (non-object)", () => {
    expect(parsePreferences("garbage")).toEqual({
      weekdays: [],
      timeRanges: [],
      modality: null,
    })
  })

  it("rejects weekday 7 (whole object invalid → defaults)", () => {
    expect(parsePreferences({ weekdays: [7] }).weekdays).toEqual([])
  })

  it("rejects malformed time range (whole object invalid → defaults)", () => {
    const result = parsePreferences({ timeRanges: [{ start: "25:00", end: "9999" }] })
    expect(result.timeRanges).toEqual([])
  })

  it("de-duplicates and sorts weekdays", () => {
    expect(parsePreferences({ weekdays: [3, 1, 3] }).weekdays).toEqual([1, 3])
  })

  it("drops inverted time ranges (start >= end)", () => {
    const result = parsePreferences({
      timeRanges: [
        { start: "21:00", end: "18:00" },
        { start: "09:00", end: "12:00" },
      ],
    })
    expect(result.timeRanges).toEqual([{ start: "09:00", end: "12:00" }])
  })

  it("defaults modality to null when absent", () => {
    expect(parsePreferences({ weekdays: [2] }).modality).toBeNull()
  })
})
