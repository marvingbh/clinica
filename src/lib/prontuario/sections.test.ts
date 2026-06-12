import { describe, it, expect } from "vitest"
import { validateSections, hasAnyContent, mergeSectionUpdate } from "./sections"
import { MAX_SECTION_LENGTH, type SectionDef } from "./types"

const defs: SectionDef[] = [
  { id: "subjetivo", label: "Subjetivo" },
  { id: "objetivo", label: "Objetivo" },
]

describe("validateSections", () => {
  it("accepts a subset of defined keys", () => {
    expect(validateSections({ subjetivo: "texto" }, defs)).toEqual({ subjetivo: "texto" })
  })

  it("rejects a key outside the template", () => {
    expect(() => validateSections({ plano: "x" }, defs)).toThrow(/desconhecida/i)
  })

  it("rejects a non-string value", () => {
    expect(() => validateSections({ subjetivo: 5 }, defs)).toThrow()
  })

  it("rejects a section over the max length", () => {
    const tooLong = "a".repeat(MAX_SECTION_LENGTH + 1)
    expect(() => validateSections({ subjetivo: tooLong }, defs)).toThrow(/limite/i)
  })

  it("accepts a section exactly at the max length", () => {
    const exact = "a".repeat(MAX_SECTION_LENGTH)
    expect(validateSections({ subjetivo: exact }, defs).subjetivo).toHaveLength(MAX_SECTION_LENGTH)
  })

  it("rejects non-object input", () => {
    expect(() => validateSections([], defs)).toThrow()
    expect(() => validateSections(null, defs)).toThrow()
  })
})

describe("hasAnyContent", () => {
  it("is false for empty object", () => {
    expect(hasAnyContent({})).toBe(false)
  })

  it("is false for whitespace-only values", () => {
    expect(hasAnyContent({ subjetivo: "   ", objetivo: "\n\t" })).toBe(false)
  })

  it("is true when at least one section has content", () => {
    expect(hasAnyContent({ subjetivo: "  ", objetivo: "ok" })).toBe(true)
  })
})

describe("mergeSectionUpdate", () => {
  it("preserves sections not present in the patch", () => {
    const current = { subjetivo: "antigo", objetivo: "manter" }
    const merged = mergeSectionUpdate(current, { subjetivo: "novo" }, defs)
    expect(merged).toEqual({ subjetivo: "novo", objetivo: "manter" })
  })

  it("validates the patch against the defs", () => {
    expect(() => mergeSectionUpdate({}, { plano: "x" }, defs)).toThrow()
  })
})
