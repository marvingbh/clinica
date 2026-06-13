import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Pass-through the auth wrapper so we can drive the handler directly.
vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: (...args: unknown[]) => unknown) =>
    handler,
}))

const mockFindMany = vi.fn()
const mockCount = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    patientDocument: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}))

// Patient ownership + storage context are exercised by the helpers; stub them.
vi.mock("./_helpers", () => ({
  ensurePatient: vi.fn().mockResolvedValue(undefined),
  loadStorageContext: vi
    .fn()
    .mockResolvedValue({ settings: { restrictExamesToProfessionals: false } }),
  mapDocumentError: () => null,
}))

vi.mock("@/lib/rbac", () => ({
  audit: { log: vi.fn() },
  AuditAction: {},
}))

import { GET } from "./route"

const user = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: null,
}

function callGET(query: string) {
  const req = new NextRequest(
    new URL(`http://localhost/api/patients/p1/documents${query}`)
  )
  const handler = GET as unknown as (
    req: NextRequest,
    ctx: { user: typeof user },
    params: { id: string }
  ) => Promise<Response>
  return handler(req, { user }, { id: "p1" })
}

describe("GET /api/patients/[id]/documents — trash filter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)
  })

  it("active view filters deletedAt = null (no trashed documents)", async () => {
    await callGET("")
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.deletedAt).toBeNull()
    expect(where.clinicId).toBe("clinic-1")
    expect(where.patientId).toBe("p1")
  })

  it("trash view returns ONLY soft-deleted documents (deletedAt not null)", async () => {
    await callGET("?includeDeleted=true")
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.deletedAt).toEqual({ not: null })
  })

  it("count uses the same where as the list (consistent total)", async () => {
    await callGET("?includeDeleted=true")
    const listWhere = mockFindMany.mock.calls[0][0].where
    const countWhere = mockCount.mock.calls[0][0].where
    expect(countWhere).toEqual(listWhere)
  })
})
