import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Pass-through auth.
vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

// Mock Prisma — only the calls fetchOverview makes.
const mockProfFindMany = vi.fn()
const mockApptFindMany = vi.fn()
const mockRuleFindMany = vi.fn()
const mockExceptionFindMany = vi.fn()
const mockInvoiceFindMany = vi.fn()
const mockPatientCount = vi.fn()
const mockAuditCreate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionalProfile: { findMany: (...a: unknown[]) => mockProfFindMany(...a) },
    appointment: { findMany: (...a: unknown[]) => mockApptFindMany(...a) },
    availabilityRule: { findMany: (...a: unknown[]) => mockRuleFindMany(...a) },
    availabilityException: { findMany: (...a: unknown[]) => mockExceptionFindMany(...a) },
    invoice: { findMany: (...a: unknown[]) => mockInvoiceFindMany(...a) },
    patient: { count: (...a: unknown[]) => mockPatientCount(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  },
}))

// Ownership lookup used by the route helper.
const mockProfBelongs = vi.fn()
vi.mock("@/lib/clinic/ownership", () => ({
  professionalBelongsToClinic: (...a: unknown[]) => mockProfBelongs(...a),
}))

import { GET } from "./route"

const mockAdmin = { id: "u1", clinicId: "clinic-1", role: "ADMIN" as const, professionalProfileId: "prof-admin" }
const mockProfessional = {
  id: "u2",
  clinicId: "clinic-1",
  role: "PROFESSIONAL" as const,
  professionalProfileId: "prof-2",
}

function makeRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/relatorios/overview")
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

async function callGET(params?: Record<string, string>, user = mockAdmin) {
  const handler = GET as Function
  return handler(makeRequest(params), { user })
}

describe("GET /api/relatorios/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProfFindMany.mockResolvedValue([])
    mockApptFindMany.mockResolvedValue([])
    mockRuleFindMany.mockResolvedValue([])
    mockExceptionFindMany.mockResolvedValue([])
    mockInvoiceFindMany.mockResolvedValue([])
    mockPatientCount.mockResolvedValue(0)
    mockProfBelongs.mockResolvedValue(true)
    mockAuditCreate.mockResolvedValue(undefined)
  })

  it("returns a coherent empty payload for a valid month query (ADMIN)", async () => {
    const res = await callGET({ year: "2026", month: "5" })
    const body = await res.json()
    expect(body.period).toBe("Maio 2026")
    expect(body.professionals).toEqual([])
    expect(body.totals.sessions).toBe(0)
  })

  it("rejects an invalid query with 400", async () => {
    const res = await callGET({ year: "2026", month: "13" })
    expect(res.status).toBe(400)
  })

  it("rejects month and quarter together with 400", async () => {
    const res = await callGET({ year: "2026", month: "5", quarter: "2" })
    expect(res.status).toBe(400)
  })

  it("returns 404 when ADMIN filters by a professional outside the clinic", async () => {
    mockProfBelongs.mockResolvedValue(false)
    const res = await callGET({ year: "2026", professionalId: "outsider" })
    expect(res.status).toBe(404)
  })

  it("PROFESSIONAL is forced to own-scope, ignoring professionalId param", async () => {
    await callGET({ year: "2026", professionalId: "someone-else" }, mockProfessional)
    // The professionals fetch must be filtered to the caller's own profile id.
    const profCall = mockProfFindMany.mock.calls[0][0]
    expect(profCall.where.id).toBe("prof-2")
    // Ownership check must NOT run for a professional (param ignored).
    expect(mockProfBelongs).not.toHaveBeenCalled()
  })

  it("PROFESSIONAL never reads invoices (no colleague revenue)", async () => {
    await callGET({ year: "2026" }, mockProfessional)
    expect(mockInvoiceFindMany).not.toHaveBeenCalled()
  })

  it("ADMIN reads invoices for revenue", async () => {
    mockProfFindMany.mockResolvedValue([{ id: "prof-1", user: { name: "Dr. Ana" } }])
    await callGET({ year: "2026", month: "5" })
    expect(mockInvoiceFindMany).toHaveBeenCalled()
  })

  it("format=csv returns text/csv with a BOM and logs an audit export", async () => {
    const res = await callGET({ year: "2026", month: "5", format: "csv" })
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toContain("ocupacao-2026-05.csv")
    // Read raw bytes: TextDecoder (used by res.text()) strips a leading BOM,
    // so assert on the UTF-8 byte sequence (EF BB BF) directly.
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
    expect(mockAuditCreate).toHaveBeenCalled()
  })
})
