import { describe, it, expect } from "vitest"
import { canonicalizeNoteContent, computeContentHash, type CanonicalNoteInput } from "./content-hash"

const base: CanonicalNoteInput = {
  patientId: "p1",
  professionalProfileId: "prof1",
  appointmentId: "a1",
  noteType: "EVOLUCAO",
  format: "SOAP",
  sessionDate: "2026-05-14T15:00:00.000Z",
  sections: { subjetivo: "s", objetivo: "o", avaliacao: "a", plano: "p" },
}

describe("canonicalizeNoteContent", () => {
  it("is stable under section key reordering", () => {
    const reordered: CanonicalNoteInput = {
      ...base,
      sections: { plano: "p", avaliacao: "a", objetivo: "o", subjetivo: "s" },
    }
    expect(canonicalizeNoteContent(base)).toBe(canonicalizeNoteContent(reordered))
  })

  it("includes the sessionDate ISO string", () => {
    expect(canonicalizeNoteContent(base)).toContain("2026-05-14T15:00:00.000Z")
  })
})

describe("computeContentHash", () => {
  it("produces a deterministic 64-char hex digest", () => {
    const h1 = computeContentHash(canonicalizeNoteContent(base))
    const h2 = computeContentHash(canonicalizeNoteContent(base))
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it("changes when a single character changes", () => {
    const changed: CanonicalNoteInput = {
      ...base,
      sections: { ...base.sections, subjetivo: "S" },
    }
    const h1 = computeContentHash(canonicalizeNoteContent(base))
    const h2 = computeContentHash(canonicalizeNoteContent(changed))
    expect(h1).not.toBe(h2)
  })

  it("changes when sessionDate changes", () => {
    const changed: CanonicalNoteInput = { ...base, sessionDate: "2026-05-15T15:00:00.000Z" }
    const h1 = computeContentHash(canonicalizeNoteContent(base))
    const h2 = computeContentHash(canonicalizeNoteContent(changed))
    expect(h1).not.toBe(h2)
  })
})
