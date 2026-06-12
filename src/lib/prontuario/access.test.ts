import { describe, it, expect } from "vitest"
import { decideNoteAccess, canWriteNote } from "./access"
import type { NoteAccessContext } from "./types"

function ctx(overrides: Partial<NoteAccessContext>): NoteAccessContext {
  return {
    viewerUserId: "u1",
    viewerProfessionalProfileId: "prof1",
    viewerProntuarioAccess: "WRITE",
    noteAuthorProfessionalProfileId: "prof1",
    noteAuthorIsActive: true,
    clinicResponsibleProfessionalId: null,
    noteStatus: "RASCUNHO",
    ...overrides,
  }
}

describe("decideNoteAccess", () => {
  it("author reads their own note (no audit), even with READ access", () => {
    const d = decideNoteAccess(ctx({ viewerProntuarioAccess: "READ" }))
    expect(d).toEqual({ allowed: true, mode: "AUTHOR", auditRead: false })
  })

  it("non-author with READ is DIRECTOR_READ and audited", () => {
    const d = decideNoteAccess(
      ctx({ viewerProfessionalProfileId: "prof2", viewerProntuarioAccess: "READ" })
    )
    expect(d).toEqual({ allowed: true, mode: "DIRECTOR_READ", auditRead: true })
  })

  it("non-author with NONE is denied", () => {
    const d = decideNoteAccess(
      ctx({ viewerProfessionalProfileId: "prof2", viewerProntuarioAccess: "NONE" })
    )
    expect(d).toEqual({ allowed: false })
  })

  it("responsible reads a note of an inactive author (RESPONSIBLE_READ)", () => {
    const d = decideNoteAccess(
      ctx({
        viewerProfessionalProfileId: "respProf",
        viewerProntuarioAccess: "NONE",
        noteAuthorProfessionalProfileId: "prof1",
        noteAuthorIsActive: false,
        clinicResponsibleProfessionalId: "respProf",
      })
    )
    expect(d).toEqual({ allowed: true, mode: "RESPONSIBLE_READ", auditRead: true })
  })

  it("responsible cannot read a note of an active author without READ", () => {
    const d = decideNoteAccess(
      ctx({
        viewerProfessionalProfileId: "respProf",
        viewerProntuarioAccess: "NONE",
        noteAuthorProfessionalProfileId: "prof1",
        noteAuthorIsActive: true,
        clinicResponsibleProfessionalId: "respProf",
      })
    )
    expect(d).toEqual({ allowed: false })
  })
})

describe("canWriteNote", () => {
  it("allows the author with WRITE", () => {
    expect(canWriteNote(ctx({}))).toBe(true)
  })

  it("denies the author with only READ", () => {
    expect(canWriteNote(ctx({ viewerProntuarioAccess: "READ" }))).toBe(false)
  })

  it("denies a non-author even with WRITE", () => {
    expect(canWriteNote(ctx({ viewerProfessionalProfileId: "prof2" }))).toBe(false)
  })
})
