import { describe, it, expect } from "vitest"
import { computeProgress } from "./progress"
import type { FormField } from "./types"

const fields: FormField[] = [
  { id: "sec", type: "section", label: "Seção" },
  { id: "a", type: "short_text", label: "Nome" },
  { id: "b", type: "scale_0_10", label: "Humor" },
  { id: "c", type: "yes_no", label: "Medicação?" },
]

describe("computeProgress", () => {
  it("ignores section headers in the total", () => {
    const p = computeProgress(fields, {})
    expect(p.total).toBe(3)
  })

  it("is 0% with no answers", () => {
    expect(computeProgress(fields, {}).percent).toBe(0)
  })

  it("is 100% when every answerable field is answered", () => {
    const p = computeProgress(fields, { a: "João", b: 7, c: true })
    expect(p.answered).toBe(3)
    expect(p.percent).toBe(100)
  })

  it("rounds the percent", () => {
    // 1 of 3 answered → 33%
    const p = computeProgress(fields, { a: "João" })
    expect(p.answered).toBe(1)
    expect(p.percent).toBe(33)
  })

  it("counts only currently-visible fields", () => {
    const conditional: FormField[] = [
      { id: "a", type: "yes_no", label: "Toma?" },
      { id: "b", type: "short_text", label: "Quais?", visibleWhen: { fieldId: "a", equals: true } },
    ]
    // a=false hides b → only 1 field counts, answered → 100%
    expect(computeProgress(conditional, { a: false }).percent).toBe(100)
    // a=true reveals b → 2 fields, 1 answered → 50%
    expect(computeProgress(conditional, { a: true }).percent).toBe(50)
  })

  it("reports 100% for an empty form", () => {
    expect(computeProgress([], {})).toEqual({ answered: 0, total: 0, percent: 100 })
  })
})
