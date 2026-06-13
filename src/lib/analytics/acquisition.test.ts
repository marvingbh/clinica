import { describe, it, expect } from "vitest"
import { acquisitionReport, NAO_INFORMADO, type NewPatientSlim } from "./acquisition"
import type { DateRange } from "./types"

const range: DateRange = {
  start: new Date("2026-04-01T00:00:00Z"),
  end: new Date("2026-07-01T00:00:00Z"), // Q2
}

function p(iso: string, source: string | null, converted: boolean): NewPatientSlim {
  return { createdAt: new Date(iso), referralSource: source, converted }
}

describe("acquisitionReport", () => {
  it("buckets by source including NAO_INFORMADO for null", () => {
    const patients: NewPatientSlim[] = [
      p("2026-04-05T12:00:00Z", "INSTAGRAM", true),
      p("2026-04-06T12:00:00Z", "INSTAGRAM", false),
      p("2026-05-01T12:00:00Z", null, false),
    ]
    const r = acquisitionReport(patients, range)
    const insta = r.bySource.find((x) => x.source === "INSTAGRAM")!
    expect(insta.count).toBe(2)
    expect(insta.converted).toBe(1)
    expect(insta.conversionPct).toBe(0.5)

    const nao = r.bySource.find((x) => x.source === NAO_INFORMADO)!
    expect(nao.label).toBe("Não informado")
    expect(nao.count).toBe(1)
    expect(r.total).toBe(3)
  })

  it("builds a per-month series ordered chronologically", () => {
    const patients: NewPatientSlim[] = [
      p("2026-05-01T12:00:00Z", "GOOGLE", false),
      p("2026-04-15T12:00:00Z", "GOOGLE", false),
      p("2026-04-20T12:00:00Z", "SITE", false),
    ]
    const r = acquisitionReport(patients, range)
    expect(r.byMonth.map((m) => `${m.year}-${m.month}`)).toEqual(["2026-4", "2026-5"])
    expect(r.byMonth[0].bySource.GOOGLE).toBe(1)
    expect(r.byMonth[0].bySource.SITE).toBe(1)
    expect(r.byMonth[1].bySource.GOOGLE).toBe(1)
  })

  it("excludes patients created outside the range", () => {
    const patients: NewPatientSlim[] = [
      p("2026-03-31T12:00:00Z", "GOOGLE", false), // before range
      p("2026-07-01T00:00:00Z", "GOOGLE", false), // exactly end (exclusive)
    ]
    const r = acquisitionReport(patients, range)
    expect(r.total).toBe(0)
    expect(r.bySource).toHaveLength(0)
  })

  it("returns empty structures for no patients", () => {
    const r = acquisitionReport([], range)
    expect(r.total).toBe(0)
    expect(r.bySource).toEqual([])
    expect(r.byMonth).toEqual([])
  })
})
