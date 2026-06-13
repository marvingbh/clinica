import { describe, it, expect } from "vitest"
import { validateFields, makeFieldId, parseFieldsSafe } from "./schema"
import type { FormField } from "./types"

const ok = (fields: FormField[]) => {
  const r = validateFields(fields)
  expect(r.ok, r.ok ? "" : (r as { error: string }).error).toBe(true)
  return r
}

describe("validateFields", () => {
  it("accepts a valid form", () => {
    const fields: FormField[] = [
      { id: "a", type: "section", label: "Identificação" },
      { id: "b", type: "short_text", label: "Nome", required: true },
      { id: "c", type: "single_choice", label: "Sexo", options: ["F", "M"] },
    ]
    ok(fields)
  })

  it("rejects duplicate ids", () => {
    const r = validateFields([
      { id: "x", type: "short_text", label: "A" },
      { id: "x", type: "short_text", label: "B" },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("duplicado")
  })

  it("rejects choice field without options", () => {
    const r = validateFields([{ id: "x", type: "single_choice", label: "Opção" }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("opção")
  })

  it("rejects multiple_choice with empty options array", () => {
    const r = validateFields([{ id: "x", type: "multiple_choice", label: "Opções", options: [] }])
    expect(r.ok).toBe(false)
  })

  it("rejects visibleWhen pointing to a non-existent field", () => {
    const r = validateFields([
      { id: "a", type: "yes_no", label: "Tem?" },
      { id: "b", type: "short_text", label: "Qual?", visibleWhen: { fieldId: "ghost", equals: true } },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("anterior")
  })

  it("rejects visibleWhen pointing to a later field (forward reference)", () => {
    const r = validateFields([
      { id: "a", type: "short_text", label: "Qual?", visibleWhen: { fieldId: "b", equals: true } },
      { id: "b", type: "yes_no", label: "Tem?" },
    ])
    expect(r.ok).toBe(false)
  })

  it("rejects an empty label", () => {
    const r = validateFields([{ id: "a", type: "short_text", label: "   " }])
    expect(r.ok).toBe(false)
  })

  it("accepts info_consent with infoText", () => {
    ok([{ id: "a", type: "info_consent", label: "Termo", infoText: "Eu concordo...", required: true }])
  })

  it("rejects info_consent without infoText", () => {
    const r = validateFields([{ id: "a", type: "info_consent", label: "Termo" }])
    expect(r.ok).toBe(false)
  })

  it("rejects a non-array input", () => {
    expect(validateFields({}).ok).toBe(false)
    expect(validateFields(null).ok).toBe(false)
  })
})

describe("makeFieldId", () => {
  it("produces unique, non-empty ids", () => {
    const a = makeFieldId()
    const b = makeFieldId()
    expect(a.length).toBeGreaterThan(2)
    expect(a).not.toBe(b)
  })
})

describe("parseFieldsSafe", () => {
  it("returns [] for corrupt input instead of throwing", () => {
    expect(parseFieldsSafe("not json")).toEqual([])
    expect(parseFieldsSafe([{ id: "x", type: "single_choice", label: "no options" }])).toEqual([])
  })

  it("returns the fields for valid input", () => {
    const fields: FormField[] = [{ id: "a", type: "short_text", label: "Nome" }]
    expect(parseFieldsSafe(fields)).toEqual(fields)
  })
})
