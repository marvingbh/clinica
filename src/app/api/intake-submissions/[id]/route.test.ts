import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api/with-auth", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockSubmissionFindFirst = vi.fn()
const mockSubmissionUpdate = vi.fn()
const mockSubmissionUpdateMany = vi.fn()
const mockPatientCreate = vi.fn()

const mockTx = {
  intakeSubmission: {
    findFirst: (...args: unknown[]) => mockSubmissionFindFirst(...args),
    update: (...args: unknown[]) => mockSubmissionUpdate(...args),
  },
  patient: {
    create: (...args: unknown[]) => mockPatientCreate(...args),
  },
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    intakeSubmission: {
      updateMany: (...args: unknown[]) => mockSubmissionUpdateMany(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
  },
}))

const mockMapSubmissionToPatient = vi.fn()
vi.mock("@/lib/intake", () => ({
  intakeUpdateSchema: { safeParse: () => ({ success: true, data: {} }) },
  mapSubmissionToPatient: (...args: unknown[]) => mockMapSubmissionToPatient(...args),
}))

const mockAuditLog = vi.fn()
vi.mock("@/lib/rbac", () => ({
  audit: { log: (...args: unknown[]) => mockAuditLog(...args) },
  AuditAction: {
    INTAKE_APPROVED: "INTAKE_APPROVED",
    INTAKE_REJECTED: "INTAKE_REJECTED",
  },
}))

import { PATCH } from "./route"

const adminUser = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: null,
}

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/intake-submissions/sub-1"), {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

async function callPATCH(body: unknown, user = adminUser) {
  const handler = PATCH as unknown as (
    req: NextRequest,
    ctx: { user: typeof adminUser },
    params: { id: string },
  ) => Promise<Response>
  return handler(makeRequest(body), { user }, { id: "sub-1" })
}

const sampleSubmission = {
  id: "sub-1",
  clinicId: "clinic-1",
  status: "PENDING",
  childName: "Pedro",
  guardianName: "Pedro pai",
  submittedAt: new Date("2026-05-01T10:00:00Z"),
}

const mappedPatientData = {
  clinicId: "clinic-1",
  name: "Pedro",
  phone: "5531999990000",
  consentPhotoVideoAt: new Date("2026-05-01T10:00:00Z"),
  consentSessionRecordingAt: null,
}

describe("PATCH /api/intake-submissions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubmissionFindFirst.mockResolvedValue(sampleSubmission)
    mockMapSubmissionToPatient.mockReturnValue(mappedPatientData)
    mockPatientCreate.mockResolvedValue({ id: "patient-1", ...mappedPatientData })
    mockSubmissionUpdate.mockResolvedValue({})
    mockSubmissionUpdateMany.mockResolvedValue({ count: 1 })
    mockAuditLog.mockResolvedValue(undefined)
  })

  describe("approve action", () => {
    it("creates the patient and flips the submission to APPROVED", async () => {
      const res = await callPATCH({ action: "approve" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.patientId).toBe("patient-1")
      expect(mockPatientCreate).toHaveBeenCalledWith({ data: mappedPatientData })
      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sub-1" },
          data: expect.objectContaining({
            status: "APPROVED",
            patientId: "patient-1",
            reviewedByUserId: "user-1",
          }),
        }),
      )
    })

    it("scopes the submission lookup to the caller's clinic and PENDING status", async () => {
      await callPATCH({ action: "approve" })
      expect(mockSubmissionFindFirst).toHaveBeenCalledWith({
        where: { id: "sub-1", clinicId: "clinic-1", status: "PENDING" },
      })
    })

    it("returns 404 when the submission does not exist (or already reviewed)", async () => {
      mockSubmissionFindFirst.mockResolvedValueOnce(null)
      const res = await callPATCH({ action: "approve" })
      expect(res.status).toBe(404)
      expect(mockPatientCreate).not.toHaveBeenCalled()
    })

    it("returns 409 on Prisma unique constraint violation (e.g. duplicate CPF)", async () => {
      mockPatientCreate.mockRejectedValueOnce({ code: "P2002" })
      const res = await callPATCH({ action: "approve" })
      expect(res.status).toBe(409)
    })

    it("logs an INTAKE_APPROVED audit entry on success", async () => {
      await callPATCH({ action: "approve" })
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INTAKE_APPROVED",
          entityType: "IntakeSubmission",
          entityId: "sub-1",
          newValues: { patientId: "patient-1" },
        }),
      )
    })
  })

  describe("reject action", () => {
    it("flips the submission to REJECTED and does not touch Patient", async () => {
      const res = await callPATCH({ action: "reject" })
      expect(res.status).toBe(200)
      expect(mockSubmissionUpdateMany).toHaveBeenCalledWith({
        where: { id: "sub-1", clinicId: "clinic-1", status: "PENDING" },
        data: expect.objectContaining({
          status: "REJECTED",
          reviewedByUserId: "user-1",
        }),
      })
      expect(mockPatientCreate).not.toHaveBeenCalled()
    })

    it("returns 404 when no PENDING submission matches", async () => {
      mockSubmissionUpdateMany.mockResolvedValueOnce({ count: 0 })
      const res = await callPATCH({ action: "reject" })
      expect(res.status).toBe(404)
    })

    it("logs an INTAKE_REJECTED audit entry on success", async () => {
      await callPATCH({ action: "reject" })
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INTAKE_REJECTED",
          entityType: "IntakeSubmission",
          entityId: "sub-1",
        }),
      )
    })
  })

  describe("invalid action", () => {
    it("rejects unknown actions with 400", async () => {
      const res = await callPATCH({ action: "delete" })
      expect(res.status).toBe(400)
    })
  })
})
