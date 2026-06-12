import { describe, it, expect } from "vitest"
import { buildTermoDescarteData, formatTermoDescarteLines, type TermoDescarteData } from "./descarte"

const data: TermoDescarteData = {
  clinicName: "Clínica Bem-Estar",
  patientName: "Maria Souza",
  recordClosedAt: new Date("2026-06-11T00:00:00Z"),
  retentionYears: 5,
  disposedAt: new Date("2031-07-01T00:00:00Z"),
  disposedByName: "Dr. Admin",
  notesCount: 3,
  addendaCount: 1,
  oldestSessionDate: new Date("2025-01-10T00:00:00Z"),
  newestSessionDate: new Date("2026-05-30T00:00:00Z"),
  contentHashes: ["abc123", "def456"],
}

describe("buildTermoDescarteData", () => {
  it("returns the aggregated data shape", () => {
    const result = buildTermoDescarteData(data)
    expect(result.notesCount).toBe(3)
    expect(result.addendaCount).toBe(1)
    expect(result.contentHashes).toEqual(["abc123", "def456"])
  })
})

describe("formatTermoDescarteLines", () => {
  const lines = formatTermoDescarteLines(data)
  const text = lines.join("\n")

  it("cites Res. CFP 01/2009 and Lei 13.787/2018", () => {
    expect(text).toContain("01/2009")
    expect(text).toContain("13.787/2018")
  })

  it("formats dates as DD/MM/YYYY", () => {
    expect(text).toContain("11/06/2026") // recordClosedAt
    expect(text).toContain("01/07/2031") // disposedAt
    expect(text).toContain("10/01/2025") // oldest session
    expect(text).toContain("30/05/2026") // newest session
  })

  it("includes the disposed counts and integrity hashes", () => {
    expect(text).toContain("3")
    expect(text).toContain("abc123")
    expect(text).toContain("def456")
  })
})
