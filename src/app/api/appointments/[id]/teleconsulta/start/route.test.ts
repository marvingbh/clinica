import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_c: unknown, handler: Function) => handler,
  forbiddenResponse: (msg: string) =>
    new Response(JSON.stringify({ error: msg }), { status: 403 }),
}))

const mockFindFirst = vi.fn()
const mockUpdateMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}))

const mockAuditLog = vi.fn()
vi.mock("@/lib/rbac", () => ({
  audit: { log: (...a: unknown[]) => mockAuditLog(...a) },
  AuditAction: { TELECONSULTA_INICIADA: "TELECONSULTA_INICIADA" },
  meetsMinAccess: (access: string, min: string) => {
    const order: Record<string, number> = { NONE: 0, READ: 1, WRITE: 2 }
    return (order[access] ?? 0) >= (order[min] ?? 0)
  },
}))

const SECRET = "test-secret"
process.env.AUTH_SECRET = SECRET
process.env.TELEHEALTH_PROVIDER = "mock"

import { POST } from "./route"

const SCHEDULED = new Date("2026-06-11T14:00:00.000Z")
const END = new Date("2026-06-11T14:50:00.000Z")

const titularUser = {
  id: "u-1",
  clinicId: "clinic-1",
  role: "PROFESSIONAL" as const,
  professionalProfileId: "prof-1",
  permissions: { agenda_own: "WRITE", agenda_others: "NONE" },
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    clinicId: "clinic-1",
    type: "CONSULTA",
    modality: "ONLINE",
    status: "AGENDADO",
    scheduledAt: SCHEDULED,
    endAt: END,
    groupId: null,
    sessionGroupId: null,
    meetingUrl: null,
    telehealthStartedAt: null,
    professionalProfileId: "prof-1",
    clinic: { telehealthEnabled: true },
    professionalProfile: { user: { name: "Dra. Maria" } },
    additionalProfessionals: [],
    ...over,
  }
}

function call(user = titularUser) {
  const req = new NextRequest(new URL("http://localhost/x"), { method: "POST" })
  return (POST as unknown as (r: NextRequest, c: { user: typeof user }, p: { id: string }) => Promise<Response>)(
    req,
    { user },
    { id: "appt-1" }
  )
}

describe("POST /api/appointments/[id]/teleconsulta/start", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(SCHEDULED)
    mockUpdateMany.mockResolvedValue({ count: 1 })
    mockAuditLog.mockResolvedValue(undefined)
  })

  it("404 when not in clinic", async () => {
    mockFindFirst.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it("starts the room and audits for the titular professional", async () => {
    mockFindFirst.mockResolvedValue(row())
    const res = await call()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.join.isModerator).toBe(true)
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
    expect(mockAuditLog).toHaveBeenCalledTimes(1)
  })

  it("is idempotent: does not re-write telehealthStartedAt", async () => {
    mockFindFirst.mockResolvedValue(row({ telehealthStartedAt: SCHEDULED }))
    const res = await call()
    expect(res.status).toBe(200)
    expect(mockUpdateMany).not.toHaveBeenCalled()
    expect(mockAuditLog).not.toHaveBeenCalled()
  })

  it("403 for a non-titular professional without agenda_others", async () => {
    mockFindFirst.mockResolvedValue(row({ professionalProfileId: "other-prof" }))
    expect((await call()).status).toBe(403)
  })

  it("allows a non-titular professional with agenda_others", async () => {
    mockFindFirst.mockResolvedValue(row({ professionalProfileId: "other-prof" }))
    const res = await call({ ...titularUser, permissions: { agenda_own: "WRITE", agenda_others: "WRITE" } })
    expect(res.status).toBe(200)
  })

  it("422 for a cancelled session", async () => {
    mockFindFirst.mockResolvedValue(row({ status: "CANCELADO_ACORDADO" }))
    const res = await call()
    expect(res.status).toBe(422)
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("422 for a presencial session (NOT_ONLINE)", async () => {
    mockFindFirst.mockResolvedValue(row({ modality: "PRESENCIAL" }))
    expect((await call()).status).toBe(422)
  })
})
