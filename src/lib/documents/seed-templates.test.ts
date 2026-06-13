import { describe, it, expect } from "vitest"
import { SYSTEM_TEMPLATES } from "./seed-templates"
import { extractPlaceholderKeys } from "./merge"
import { getPlaceholder } from "./placeholders"
import { DOCUMENT_TYPES } from "./types"

describe("SYSTEM_TEMPLATES", () => {
  it("has a seed for all document types", () => {
    expect(DOCUMENT_TYPES.length).toBe(13)
    for (const type of DOCUMENT_TYPES) {
      expect(SYSTEM_TEMPLATES[type]).toBeDefined()
      expect(SYSTEM_TEMPLATES[type].name.length).toBeGreaterThan(0)
      expect(SYSTEM_TEMPLATES[type].body.length).toBeGreaterThan(0)
    }
  })

  it("every placeholder used in a seed exists in the registry", () => {
    for (const type of DOCUMENT_TYPES) {
      const keys = extractPlaceholderKeys(SYSTEM_TEMPLATES[type].body)
      for (const key of keys) {
        expect(getPlaceholder(key), `unknown placeholder {{${key}}} in ${type}`).toBeDefined()
      }
    }
  })

  it("the declaração seed uses ONLY the CFP-allowed placeholders (no clinical content)", () => {
    const allowed = new Set([
      "patientName",
      "appointmentDate",
      "appointmentStartTime",
      "appointmentEndTime",
      "professionalName",
      "crp",
      "clinicName",
      "currentDate",
    ])
    const keys = extractPlaceholderKeys(SYSTEM_TEMPLATES.DECLARACAO_COMPARECIMENTO.body)
    for (const key of keys) {
      expect(allowed.has(key), `disallowed placeholder {{${key}}} in declaração`).toBe(true)
    }
  })
})
