import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const mockFindUnique = vi.fn()
const mockAuditCreate = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  },
}))

const mockCheckRateLimit = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  RATE_LIMIT_CONFIGS: { publicApi: { maxRequests: 10, windowMs: 60000 } },
}))

// Real telehealth module (pure) — drive via a known AUTH_SECRET.
const SECRET = "test-secret"
process.env.AUTH_SECRET = SECRET
process.env.TELEHEALTH_PROVIDER = "mock"

import { GET } from "./route"
import { buildVideoToken } from "@/lib/telehealth"

const SCHEDULED = new Date("2026-06-11T14:00:00.000Z")
const END = new Date("2026-06-11T14:50:00.000Z")

function makeReq() {
  return new NextRequest(new URL("http://localhost/api/public/teleconsulta/x"), {
    headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "vitest" },
  })
}

function call(token: string) {
  return GET(makeReq(), { params: Promise.resolve({ token }) })
}

function appointmentRow(over: Record<string, unknown> = {}) {
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
    clinic: { name: "Clínica X", phone: "5531999990000", telehealthEnabled: true },
    patient: { name: "João Silva" },
    professionalProfile: { user: { name: "Dra. Maria" } },
    ...over,
  }
}

describe("GET /api/public/teleconsulta/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(SCHEDULED)
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 })
    mockAuditCreate.mockResolvedValue(undefined)
  })

  it("returns 400 for a malformed token without touching the DB", async () => {
    const res = await call("not-a-valid-token")
    expect(res.status).toBe(400)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it("returns 400 for a bad signature without touching the DB", async () => {
    const res = await call("appt-1.deadbeef")
    expect(res.status).toBe(400)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 5000 })
    const res = await call(buildVideoToken("appt-1", SECRET))
    expect(res.status).toBe(429)
  })

  it("returns OK with join info inside the window", async () => {
    mockFindUnique.mockResolvedValue(appointmentRow())
    const res = await call(buildVideoToken("appt-1", SECRET))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.state).toBe("OK")
    expect(data.join).toBeDefined()
    expect(data.join.provider).toBe("mock")
    expect(data.patientFirstName).toBe("João")
    expect(data.professionalName).toBe("Dra. Maria")
  })

  it("omits join info when not OK (TOO_EARLY)", async () => {
    vi.setSystemTime(new Date(SCHEDULED.getTime() - 60 * 60 * 1000))
    mockFindUnique.mockResolvedValue(appointmentRow())
    const res = await call(buildVideoToken("appt-1", SECRET))
    const data = await res.json()
    expect(data.state).toBe("TOO_EARLY")
    expect(data.join).toBeUndefined()
    expect(data.scheduledAt).toBe(SCHEDULED.toISOString())
  })

  it("reports CANCELLED for a cancelled appointment", async () => {
    mockFindUnique.mockResolvedValue(appointmentRow({ status: "CANCELADO_ACORDADO" }))
    const res = await call(buildVideoToken("appt-1", SECRET))
    const data = await res.json()
    expect(data.state).toBe("CANCELLED")
    expect(data.join).toBeUndefined()
  })

  it("audits the access with the appointment's clinicId", async () => {
    mockFindUnique.mockResolvedValue(appointmentRow())
    await call(buildVideoToken("appt-1", SECRET))
    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
    const arg = mockAuditCreate.mock.calls[0][0]
    expect(arg.data.clinicId).toBe("clinic-1")
    expect(arg.data.action).toBe("TELECONSULTA_ACESSO_PACIENTE")
    expect(arg.data.userId).toBeNull()
  })

  it("does not explode when patient is null (optional chaining)", async () => {
    mockFindUnique.mockResolvedValue(appointmentRow({ patient: null }))
    const res = await call(buildVideoToken("appt-1", SECRET))
    const data = await res.json()
    expect(data.patientFirstName).toBe("Paciente")
  })

  it("returns 400 when the appointment does not exist", async () => {
    mockFindUnique.mockResolvedValue(null)
    const res = await call(buildVideoToken("appt-1", SECRET))
    expect(res.status).toBe(400)
  })
})
