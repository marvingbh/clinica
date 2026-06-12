import { describe, it, expect } from "vitest"
import { parseDraftSections } from "./parse"

const keys = ["subjetivo", "objetivo", "avaliacao", "plano"]

describe("parseDraftSections", () => {
  it("returns a SectionMap from a valid object", () => {
    const r = parseDraftSections(
      { subjetivo: "a", objetivo: "b", avaliacao: "c", plano: "d" },
      keys
    )
    expect(r).toEqual({ subjetivo: "a", objetivo: "b", avaliacao: "c", plano: "d" })
  })

  it("parses a valid JSON string", () => {
    const r = parseDraftSections('{"subjetivo":"x","objetivo":"y","avaliacao":"","plano":""}', keys)
    expect(r?.subjetivo).toBe("x")
    expect(r?.objetivo).toBe("y")
  })

  it("fills missing keys with empty string", () => {
    const r = parseDraftSections({ subjetivo: "só isso" }, keys)
    expect(r).toEqual({ subjetivo: "só isso", objetivo: "", avaliacao: "", plano: "" })
  })

  it("discards extra keys", () => {
    const r = parseDraftSections({ subjetivo: "a", extra: "ignore", plano: "p" }, keys)
    expect(r).not.toHaveProperty("extra")
    expect(r?.subjetivo).toBe("a")
    expect(r?.plano).toBe("p")
  })

  it("coerces primitive numbers/booleans with String()", () => {
    const r = parseDraftSections({ subjetivo: 42, objetivo: true }, keys)
    expect(r?.subjetivo).toBe("42")
    expect(r?.objetivo).toBe("true")
  })

  it("drops object/array values to empty string", () => {
    const r = parseDraftSections({ subjetivo: "ok", objetivo: { a: 1 }, plano: [1, 2] }, keys)
    expect(r?.objetivo).toBe("")
    expect(r?.plano).toBe("")
  })

  it("returns null for garbage input", () => {
    expect(parseDraftSections("not json", keys)).toBeNull()
    expect(parseDraftSections(null, keys)).toBeNull()
    expect(parseDraftSections([1, 2, 3], keys)).toBeNull()
    expect(parseDraftSections(123, keys)).toBeNull()
  })

  it("returns null when no expected key has content", () => {
    expect(parseDraftSections({ subjetivo: "", objetivo: "  " }, keys)).toBeNull()
    expect(parseDraftSections({ outra: "conteúdo" }, keys)).toBeNull()
  })
})
