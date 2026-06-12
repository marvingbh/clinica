import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: (...args: unknown[]) => unknown) => handler,
}))

const mockNoteCreate = vi.fn()
const mockNoteFindMany = vi.fn()
const mockNoteFindFirst = vi.fn()
const mockNoteCount = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinicalNote: {
      create: (...a: unknown[]) => mockNoteCreate(...a),
      findMany: (...a: unknown[]) => mockNoteFindMany(...a),
      findFirst: (...a: unknown[]) => mockNoteFindFirst(...a),
      count: (...a: unknown[]) => mockNoteCount(...a),
    },
  },
}))

const mockAudit = vi.fn()
vi.mock("@/lib/rbac", () => ({
  audit: { log: (...a: unknown[]) => mockAudit(...a) },
  AuditAction: { CLINICAL_NOTE_CREATED: "CLINICAL_NOTE_CREATED" },
  meetsMinAccess: (actual: string, req: string) => {
    const lvl: Record<string, number> = { NONE: 0, READ: 1, WRITE: 2 }
    return lvl[actual] >= lvl[req]
  },
}))

const mockAssertPatient = vi.fn()
const mockAssertAppointment = vi.fn()
vi.mock("@/lib/clinic/ownership", () => ({
  assertPatientInClinic: (...a: unknown[]) => mockAssertPatient(...a),
  assertAppointmentInClinic: (...a: unknown[]) => mockAssertAppointment(...a),
}))

vi.mock("../_helpers", () => ({
  ownershipErrorResponse: () => null,
}))

import { GET, POST } from "./route"

const proUser = {
  id: "u1",
  clinicId: "c1",
  role: "PROFESSIONAL" as const,
  professionalProfileId: "prof1",
  permissions: { prontuario: "WRITE" },
}

function makeReq(url: string, body?: unknown) {
  return new NextRequest(new URL(url), {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  })
}

function callPOST(body: unknown, user: typeof proUser = proUser) {
  return (POST as unknown as (r: NextRequest, c: { user: typeof proUser; access: string }) => Promise<Response>)(
    makeReq("http://localhost/api/prontuario/notes", body),
    { user, access: user.permissions.prontuario }
  )
}

function callGET(url: string, user: typeof proUser = proUser) {
  return (GET as unknown as (r: NextRequest, c: { user: typeof proUser; access: string }) => Promise<Response>)(
    makeReq(url),
    { user, access: user.permissions.prontuario }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertPatient.mockResolvedValue(undefined)
  mockAudit.mockResolvedValue(undefined)
})

describe("POST /api/prontuario/notes", () => {
  it("returns 422 when the user has no professionalProfileId", async () => {
    const res = await callPOST({ patientId: "p1" }, { ...proUser, professionalProfileId: null })
    expect(res.status).toBe(422)
  })

  it("returns 422 when the appointment is not a CONSULTA", async () => {
    mockAssertAppointment.mockResolvedValue({
      id: "a1",
      type: "REUNIAO",
      patientId: "p1",
      scheduledAt: new Date(),
    })
    const res = await callPOST({ patientId: "p1", appointmentId: "a1" })
    expect(res.status).toBe(422)
  })

  it("returns 422 when the appointment patient differs from the body", async () => {
    mockAssertAppointment.mockResolvedValue({
      id: "a1",
      type: "CONSULTA",
      patientId: "OTHER",
      scheduledAt: new Date(),
    })
    const res = await callPOST({ patientId: "p1", appointmentId: "a1" })
    expect(res.status).toBe(422)
  })

  it("creates a draft for a valid standalone note", async () => {
    mockNoteCreate.mockResolvedValue({ id: "note-1", appointmentId: null, format: "SOAP", noteType: "EVOLUCAO" })
    const res = await callPOST({ patientId: "p1" })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.note.id).toBe("note-1")
  })

  it("returns 409 with existingNoteId on a unique-constraint conflict", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "x",
    })
    mockNoteCreate.mockRejectedValue(p2002)
    mockNoteFindFirst.mockResolvedValue({ id: "existing-1" })
    mockAssertAppointment.mockResolvedValue({
      id: "a1",
      type: "CONSULTA",
      patientId: "p1",
      scheduledAt: new Date(),
    })
    const res = await callPOST({ patientId: "p1", appointmentId: "a1" })
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.existingNoteId).toBe("existing-1")
  })
})

describe("GET /api/prontuario/notes", () => {
  beforeEach(() => {
    mockNoteFindMany.mockResolvedValue([])
    mockNoteCount.mockResolvedValue(0)
  })

  it("browses cross-patient without patientId, forcing own professional for a WRITE author", async () => {
    const res = await callGET("http://localhost/api/prontuario/notes?status=ASSINADA&search=ana")
    expect(res.status).toBe(200)
    const where = mockNoteFindMany.mock.calls[0][0].where
    expect(where.patientId).toBeUndefined()
    expect(where.professionalProfileId).toBe("prof1")
    expect(where.status).toBe("ASSINADA")
    expect(where.patient).toEqual({ name: { contains: "ana", mode: "insensitive" } })
    const json = await res.json()
    expect(json).toMatchObject({ page: 1, total: 0 })
  })

  it("forces own-professional filter for a WRITE author (no broad read)", async () => {
    await callGET("http://localhost/api/prontuario/notes?patientId=p1&professionalProfileId=other")
    const where = mockNoteFindMany.mock.calls[0][0].where
    expect(where.professionalProfileId).toBe("prof1")
  })

  it("lets a READ director browse another professional's notes", async () => {
    const director = { ...proUser, permissions: { prontuario: "READ" } }
    await callGET(
      "http://localhost/api/prontuario/notes?patientId=p1&professionalProfileId=other",
      director
    )
    const where = mockNoteFindMany.mock.calls[0][0].where
    expect(where.professionalProfileId).toBe("other")
  })
})
