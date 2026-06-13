import { describe, it, expect } from "vitest"
import { parseReportQuery } from "./query"

function sp(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj)
}

describe("parseReportQuery", () => {
  it("parses a valid month query", () => {
    const r = parseReportQuery(sp({ year: "2026", month: "5" }))
    expect(r).toEqual({
      ok: true,
      period: { year: 2026, month: 5, quarter: null },
      professionalId: null,
      format: "json",
    })
  })

  it("parses a valid quarter query", () => {
    const r = parseReportQuery(sp({ year: "2026", quarter: "2" }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.period).toEqual({ year: 2026, month: null, quarter: 2 })
    }
  })

  it("parses a year-only query (no month/quarter)", () => {
    const r = parseReportQuery(sp({ year: "2026" }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.period).toEqual({ year: 2026, month: null, quarter: null })
  })

  it("rejects month and quarter together", () => {
    const r = parseReportQuery(sp({ year: "2026", month: "5", quarter: "2" }))
    expect(r.ok).toBe(false)
  })

  it("rejects month out of range", () => {
    expect(parseReportQuery(sp({ year: "2026", month: "13" })).ok).toBe(false)
    expect(parseReportQuery(sp({ year: "2026", month: "0" })).ok).toBe(false)
  })

  it("rejects quarter out of range", () => {
    expect(parseReportQuery(sp({ year: "2026", quarter: "5" })).ok).toBe(false)
  })

  it("rejects a bad year", () => {
    expect(parseReportQuery(sp({ year: "abc" })).ok).toBe(false)
    expect(parseReportQuery(sp({ year: "1999" })).ok).toBe(false)
  })

  it("reads format=csv", () => {
    const r = parseReportQuery(sp({ year: "2026", month: "5", format: "csv" }))
    expect(r.ok && r.format).toBe("csv")
  })

  it("defaults format to json for unknown values", () => {
    const r = parseReportQuery(sp({ year: "2026", format: "pdf" }))
    expect(r.ok && r.format).toBe("json")
  })

  it("captures professionalId", () => {
    const r = parseReportQuery(sp({ year: "2026", professionalId: "prof-7" }))
    expect(r.ok && r.professionalId).toBe("prof-7")
  })

  it("defaults year to current UTC year when absent", () => {
    const r = parseReportQuery(sp({}))
    expect(r.ok && r.period.year).toBe(new Date().getUTCFullYear())
  })
})
