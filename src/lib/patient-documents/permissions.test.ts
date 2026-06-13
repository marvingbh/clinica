import { describe, it, expect } from "vitest"
import {
  canViewDocument,
  canEditDocument,
  canDeleteDocument,
  visibleCategoriesFor,
  type DocumentMeta,
} from "./permissions"

const professional = { professionalProfileId: "pp1" }
const secretary = { professionalProfileId: null }

function meta(over: Partial<DocumentMeta> = {}): DocumentMeta {
  return { source: "UPLOAD", category: "DOCUMENTO", deletedAt: null, ...over }
}

describe("canViewDocument", () => {
  it("hides EXAME from non-professionals when the restriction is on", () => {
    expect(
      canViewDocument(secretary, meta({ category: "EXAME" }), {
        restrictExamesToProfessionals: true,
      })
    ).toBe(false)
  })

  it("shows EXAME to professionals even with the restriction on", () => {
    expect(
      canViewDocument(professional, meta({ category: "EXAME" }), {
        restrictExamesToProfessionals: true,
      })
    ).toBe(true)
  })

  it("shows EXAME to everyone when the restriction is off", () => {
    expect(
      canViewDocument(secretary, meta({ category: "EXAME" }), {
        restrictExamesToProfessionals: false,
      })
    ).toBe(true)
  })

  it("shows other categories regardless of restriction/viewer", () => {
    for (const category of ["DOCUMENTO", "CONTRATO", "ENCAMINHAMENTO", "OUTRO"]) {
      expect(
        canViewDocument(secretary, meta({ category }), {
          restrictExamesToProfessionals: true,
        })
      ).toBe(true)
    }
  })
})

describe("canEditDocument / canDeleteDocument", () => {
  it("allows UPLOAD that is not deleted", () => {
    expect(canEditDocument(meta())).toBe(true)
    expect(canDeleteDocument(meta())).toBe(true)
  })

  it("forbids system-generated sources", () => {
    for (const source of ["GERADO", "ASSINADO", "FORMULARIO"] as const) {
      expect(canEditDocument(meta({ source }))).toBe(false)
      expect(canDeleteDocument(meta({ source }))).toBe(false)
    }
  })

  it("forbids editing/deleting a soft-deleted document", () => {
    const deleted = meta({ deletedAt: new Date() })
    expect(canEditDocument(deleted)).toBe(false)
    expect(canDeleteDocument(deleted)).toBe(false)
  })
})

describe("visibleCategoriesFor", () => {
  it("drops EXAME for non-professionals when restricted", () => {
    const cats = visibleCategoriesFor(secretary, {
      restrictExamesToProfessionals: true,
    })
    expect(cats).not.toContain("EXAME")
    expect(cats).toHaveLength(4)
  })

  it("includes all categories for professionals when restricted", () => {
    const cats = visibleCategoriesFor(professional, {
      restrictExamesToProfessionals: true,
    })
    expect(cats).toContain("EXAME")
    expect(cats).toHaveLength(5)
  })

  it("includes all categories for everyone when not restricted", () => {
    expect(
      visibleCategoriesFor(secretary, { restrictExamesToProfessionals: false })
    ).toHaveLength(5)
  })
})
