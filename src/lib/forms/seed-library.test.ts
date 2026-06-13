import { describe, it, expect } from "vitest"
import { SEED_TEMPLATES } from "./seed-library"
import { validateFields } from "./schema"
import { canPublish } from "./versioning"

describe("SEED_TEMPLATES", () => {
  it("ships exactly four templates with unique names", () => {
    expect(SEED_TEMPLATES).toHaveLength(4)
    const names = SEED_TEMPLATES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("every template validates and is publishable", () => {
    for (const tpl of SEED_TEMPLATES) {
      const result = validateFields(tpl.fields)
      expect(result.ok, `${tpl.name}: ${result.ok ? "" : result.error}`).toBe(true)
      expect(canPublish(tpl.fields).ok, `${tpl.name} canPublish`).toBe(true)
    }
  })

  it("includes the expected pt-BR copy", () => {
    const names = SEED_TEMPLATES.map((t) => t.name).join(" | ")
    expect(names).toContain("Anamnese")
    expect(names).toContain("LGPD")
  })

  it("every template has a non-empty description", () => {
    for (const tpl of SEED_TEMPLATES) {
      expect(tpl.description.length).toBeGreaterThan(0)
    }
  })
})
