import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: (...args: unknown[]) => unknown) => handler,
}))

const mockUpdateMany = vi.fn()
const mockFindUnique = vi.fn()
const mockFindFirst = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinicalNote: {
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
    },
  },
}))

vi.mock("@/lib/rbac", () => ({
  audit: { log: vi.fn().mockResolvedValue(undefined) },
  AuditAction: {
    CLINICAL_NOTE_UPDATED: "CLINICAL_NOTE_UPDATED",
    CLINICAL_NOTE_ACCESSED: "CLINICAL_NOTE_ACCESSED",
    CLINICAL_NOTE_DELETED: "CLINICAL_NOTE_DELETED",
  },
}))

// Pure helpers — stub to the permissive path so we exercise the data-building branch.
vi.mock("@/lib/prontuario", () => ({
  canWriteNote: () => true,
  hasAnyContent: () => false, // empty draft → template switch is allowed
  isStaleUpdate: () => false,
  mergeSectionUpdate: (cur: object, patch: object) => ({ ...cur, ...patch }),
}))

const mockResolveNoteAccess = vi.fn()
vi.mock("../../_helpers", () => ({
  resolveNoteAccess: (...a: unknown[]) => mockResolveNoteAccess(...a),
  resolveSectionDefs: vi.fn().mockResolvedValue([{ id: "d", label: "D" }]),
  buildNoteDetail: vi.fn().mockResolvedValue({ id: "note-1" }),
}))

import { PATCH } from "./route"

const proUser = {
  id: "u1",
  clinicId: "c1",
  role: "PROFESSIONAL" as const,
  professionalProfileId: "prof1",
  permissions: { prontuario: "WRITE" },
}

const draftNote = {
  id: "note-1",
  clinicId: "c1",
  professionalProfileId: "prof1",
  status: "RASCUNHO",
  sections: {},
  templateId: null,
  format: "SOAP",
}

function callPATCH(body: unknown) {
  return (
    PATCH as unknown as (
      r: NextRequest,
      c: { user: typeof proUser },
      p: { id: string }
    ) => Promise<Response>
  )(
    new NextRequest(new URL("http://localhost/api/prontuario/notes/note-1"), {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { user: proUser },
    { id: "note-1" }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveNoteAccess.mockResolvedValue({ note: draftNote, decision: { mode: "AUTHOR" } })
  mockUpdateMany.mockResolvedValue({ count: 1 })
  mockFindUnique.mockResolvedValue({ ...draftNote, updatedAt: new Date() })
})

describe("PATCH /api/prontuario/notes/[id] — template change", () => {
  it("writes the scalar templateId to updateMany, never the `template` relation (updateMany rejects relation ops)", async () => {
    const res = await callPATCH({ templateId: "tpl-1", updatedAt: new Date().toISOString() })
    expect(res.status).toBe(200)

    const data = mockUpdateMany.mock.calls[0][0].data
    // Regression: a relation `connect`/`disconnect` here throws
    // "Unknown argument `template`" at runtime under updateMany.
    expect(data).not.toHaveProperty("template")
    expect(data.templateId).toBe("tpl-1")
  })

  it("clears the template with a null scalar (not a relation disconnect)", async () => {
    const res = await callPATCH({ templateId: null, updatedAt: new Date().toISOString() })
    expect(res.status).toBe(200)

    const data = mockUpdateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty("template")
    expect(data.templateId).toBeNull()
  })

  it("autosaves section content without touching template fields", async () => {
    const res = await callPATCH({
      sections: { d: "conteúdo da sessão" },
      updatedAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)
    const data = mockUpdateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty("template")
    expect(data.sections).toEqual({ d: "conteúdo da sessão" })
  })
})
