import { describe, it, expect } from "vitest"
import { isFieldVisible, getVisibleFields } from "./visibility"
import type { FormField } from "./types"

describe("isFieldVisible", () => {
  it("a field without visibleWhen is always visible", () => {
    const field: FormField = { id: "a", type: "short_text", label: "Nome" }
    expect(isFieldVisible(field, {})).toBe(true)
  })

  it("visible when a string answer equals the target", () => {
    const field: FormField = { id: "b", type: "short_text", label: "Qual?", visibleWhen: { fieldId: "a", equals: "Sim" } }
    expect(isFieldVisible(field, { a: "Sim" })).toBe(true)
    expect(isFieldVisible(field, { a: "Não" })).toBe(false)
  })

  it("visible when a number answer equals the target", () => {
    const field: FormField = { id: "b", type: "short_text", label: "Qual?", visibleWhen: { fieldId: "a", equals: 5 } }
    expect(isFieldVisible(field, { a: 5 })).toBe(true)
    expect(isFieldVisible(field, { a: 4 })).toBe(false)
  })

  it("visible when a boolean answer equals the target", () => {
    const field: FormField = { id: "b", type: "short_text", label: "Qual?", visibleWhen: { fieldId: "a", equals: true } }
    expect(isFieldVisible(field, { a: true })).toBe(true)
    expect(isFieldVisible(field, { a: false })).toBe(false)
  })

  it("invisible when the dependency has no answer", () => {
    const field: FormField = { id: "b", type: "short_text", label: "Qual?", visibleWhen: { fieldId: "a", equals: true } }
    expect(isFieldVisible(field, {})).toBe(false)
  })
})

describe("getVisibleFields chained conditions", () => {
  const fields: FormField[] = [
    { id: "a", type: "yes_no", label: "Toma medicação?" },
    { id: "b", type: "yes_no", label: "Mais de uma?", visibleWhen: { fieldId: "a", equals: true } },
    { id: "c", type: "short_text", label: "Quais?", visibleWhen: { fieldId: "b", equals: true } },
  ]

  it("shows the whole chain when each link matches", () => {
    const visible = getVisibleFields(fields, { a: true, b: true })
    expect(visible.map((f) => f.id)).toEqual(["a", "b", "c"])
  })

  it("hides a field whose dependency is itself invisible", () => {
    // b is invisible (a=false), so c is invisible even if c's own answer would match.
    const visible = getVisibleFields(fields, { a: false, b: true })
    expect(visible.map((f) => f.id)).toEqual(["a"])
  })

  it("multiple_choice condition matches when the option is selected", () => {
    const mc: FormField[] = [
      { id: "a", type: "multiple_choice", label: "Sintomas", options: ["Ansiedade", "Insônia"] },
      { id: "b", type: "short_text", label: "Detalhe a insônia", visibleWhen: { fieldId: "a", equals: "Insônia" } },
    ]
    expect(getVisibleFields(mc, { a: ["Insônia"] }).map((f) => f.id)).toEqual(["a", "b"])
    expect(getVisibleFields(mc, { a: ["Ansiedade"] }).map((f) => f.id)).toEqual(["a"])
  })
})
