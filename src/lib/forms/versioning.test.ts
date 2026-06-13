import { describe, it, expect } from "vitest"
import { canPublish, nextVersion, hasUnpublishedChanges } from "./versioning"
import type { FormField } from "./types"

const answerable: FormField[] = [{ id: "a", type: "short_text", label: "Nome" }]
const sectionsOnly: FormField[] = [{ id: "s", type: "section", label: "Seção" }]

describe("canPublish", () => {
  it("fails for an empty list", () => {
    expect(canPublish([]).ok).toBe(false)
  })

  it("fails for sections-only", () => {
    const r = canPublish(sectionsOnly)
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it("succeeds with at least one answerable field", () => {
    expect(canPublish(answerable).ok).toBe(true)
  })
})

describe("nextVersion", () => {
  it("is 1 with no versions", () => {
    expect(nextVersion([])).toBe(1)
  })

  it("is max + 1", () => {
    expect(nextVersion([{ version: 1 }, { version: 3 }, { version: 2 }])).toBe(4)
  })
})

describe("hasUnpublishedChanges", () => {
  it("true when there is no published version and draft is non-empty", () => {
    expect(hasUnpublishedChanges(answerable, null)).toBe(true)
  })

  it("false when no published version and draft is empty", () => {
    expect(hasUnpublishedChanges([], null)).toBe(false)
  })

  it("false when draft equals latest", () => {
    expect(hasUnpublishedChanges(answerable, answerable)).toBe(false)
  })

  it("true when draft differs from latest", () => {
    const changed: FormField[] = [{ id: "a", type: "short_text", label: "Nome completo" }]
    expect(hasUnpublishedChanges(changed, answerable)).toBe(true)
  })

  it("ignores key order / optional-field defaults", () => {
    const a: FormField[] = [{ id: "a", type: "short_text", label: "Nome", required: false }]
    const b: FormField[] = [{ id: "a", type: "short_text", label: "Nome" }]
    expect(hasUnpublishedChanges(a, b)).toBe(false)
  })
})
