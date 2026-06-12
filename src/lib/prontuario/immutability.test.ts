import { describe, it, expect } from "vitest"
import { canEditNote, canDeleteNote, validateSign, isStaleUpdate } from "./immutability"

describe("canEditNote / canDeleteNote", () => {
  it("allows edit and delete for RASCUNHO", () => {
    expect(canEditNote("RASCUNHO")).toBe(true)
    expect(canDeleteNote("RASCUNHO")).toBe(true)
  })

  it("forbids edit and delete for ASSINADA", () => {
    expect(canEditNote("ASSINADA")).toBe(false)
    expect(canDeleteNote("ASSINADA")).toBe(false)
  })
})

describe("validateSign", () => {
  it("rejects an already-signed note", () => {
    expect(validateSign("ASSINADA", { a: "x" })).toEqual({ ok: false, reason: "ALREADY_SIGNED" })
  })

  it("rejects empty sections", () => {
    expect(validateSign("RASCUNHO", {})).toEqual({ ok: false, reason: "EMPTY_SECTIONS" })
    expect(validateSign("RASCUNHO", { a: "   " })).toEqual({
      ok: false,
      reason: "EMPTY_SECTIONS",
    })
  })

  it("accepts a draft with at least one filled section", () => {
    expect(validateSign("RASCUNHO", { a: "conteúdo" })).toEqual({ ok: true })
  })
})

describe("isStaleUpdate", () => {
  it("is true when timestamps differ", () => {
    expect(
      isStaleUpdate("2026-05-14T15:00:00.000Z", new Date("2026-05-14T15:00:01.000Z"))
    ).toBe(true)
  })

  it("is false when timestamps match exactly (0 ms tolerance)", () => {
    expect(
      isStaleUpdate("2026-05-14T15:00:00.000Z", new Date("2026-05-14T15:00:00.000Z"))
    ).toBe(false)
  })
})
