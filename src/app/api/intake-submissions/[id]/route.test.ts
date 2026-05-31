import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api/with-auth", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockSubmissionFindFirst = vi.fn()
const mockSubmissionUpdate = vi.fn()
const mockSubmissionUpdateMany = vi.fn()
const mockPatientCreate = vi.fn()
const mockProfessionalProfileFindFirst = vi.fn()

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
    professionalProfile: {
      findFirst: (...args: unknown[]) => mockProfessionalProfileFindFirst(...args),
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
    // Operator-supplied referenceProfessionalId is validated against the clinic;
    // default to an in-clinic professional so approval proceeds.
    mockProfessionalProfileFindFirst.mockResolvedValue({ id: "prof-1" })
  })

  describe("approve action", () => {
    it("creates the patient and flips the submission to APPROVED", async () => {
      const res = await callPATCH({ action: "approve" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.patientId).toBe("patient-1")
      const createArg = mockPatientCreate.mock.calls[0][0]
      expect(createArg.data).toMatchObject(mappedPatientData)
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
          newValues: expect.objectContaining({ patientId: "patient-1", edited: false }),
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

  describe("approve with operator-edited patient body", () => {
    const operatorPatient = {
      name: "Pedro Operator-Edited",
      phone: "5531999990000",
      email: "operator@example.com",
      sessionFee: 250,
      referenceProfessionalId: "prof-1",
      therapeuticProject: "Sessões iniciais com responsáveis",
      consentWhatsApp: true,
      consentEmail: false,
    }

    beforeEach(() => {
      // Reset the patient lookup so dup-CPF check passes by default.
      mockPatientCreate.mockImplementation((args: { data: { id?: string } } | undefined) => {
        return Promise.resolve({ id: "patient-1", ...(args?.data ?? {}) })
      })
    })

    it("validates the patient body and returns 400 on bad data", async () => {
      const res = await callPATCH({ action: "approve", patient: { name: "X" } })
      expect(res.status).toBe(400)
      expect(mockPatientCreate).not.toHaveBeenCalled()
    })

    it("creates the patient with operator overrides on success", async () => {
      const res = await callPATCH({ action: "approve", patient: operatorPatient })
      expect(res.status).toBe(200)
      const callArg = mockPatientCreate.mock.calls[0][0]
      expect(callArg.data).toMatchObject({
        clinicId: "clinic-1",
        name: "Pedro Operator-Edited",
        phone: "5531999990000",
        sessionFee: 250,
        referenceProfessionalId: "prof-1",
        therapeuticProject: "Sessões iniciais com responsáveis",
      })
    })

    it("rejects an operator referenceProfessionalId from another clinic with 400", async () => {
      // Professional not found within the clinic → cross-tenant association blocked.
      mockProfessionalProfileFindFirst.mockResolvedValueOnce(null)
      const res = await callPATCH({ action: "approve", patient: operatorPatient })
      expect(res.status).toBe(400)
      expect(mockPatientCreate).not.toHaveBeenCalled()
    })

    it("preserves the consent timestamps from the intake mapping (LGPD)", async () => {
      await callPATCH({ action: "approve", patient: operatorPatient })
      const callArg = mockPatientCreate.mock.calls[0][0]
      expect(callArg.data.consentPhotoVideoAt).toEqual(
        new Date("2026-05-01T10:00:00Z"),
      )
      expect(callArg.data.consentSessionRecordingAt).toBeNull()
    })

    it("stamps consentWhatsAppAt and consentEmailAt based on the operator's choice", async () => {
      await callPATCH({
        action: "approve",
        patient: { ...operatorPatient, consentWhatsApp: true, consentEmail: false },
      })
      const callArg = mockPatientCreate.mock.calls[0][0]
      expect(callArg.data.consentWhatsApp).toBe(true)
      expect(callArg.data.consentWhatsAppAt).toBeInstanceOf(Date)
      expect(callArg.data.consentEmail).toBe(false)
      expect(callArg.data.consentEmailAt).toBeNull()
    })

    it("returns 409 when the operator's CPF already exists in the clinic", async () => {
      // tx.patient.findUnique is the inline duplicate-CPF guard.
      mockTx.patient.findUnique = vi.fn().mockResolvedValueOnce({ id: "other", cpf: "12345678901" })
      const res = await callPATCH({
        action: "approve",
        patient: { ...operatorPatient, cpf: "12345678901" },
      })
      expect(res.status).toBe(409)
      expect(mockPatientCreate).not.toHaveBeenCalled()
      // Restore for next test
      mockTx.patient.findUnique = vi.fn()
    })

    it("returns 400 when primary phone duplicates an additional phone", async () => {
      const res = await callPATCH({
        action: "approve",
        patient: {
          ...operatorPatient,
          additionalPhones: [{ phone: "5531999990000", label: "Pai", notify: true }],
        },
      })
      expect(res.status).toBe(400)
      expect(mockPatientCreate).not.toHaveBeenCalled()
    })

    it("creates additionalPhones nested under the patient when provided", async () => {
      await callPATCH({
        action: "approve",
        patient: {
          ...operatorPatient,
          additionalPhones: [
            { phone: "5531888880000", label: "Mãe", notify: true },
            { phone: "5531777770000", label: "Pai", notify: false },
          ],
        },
      })
      const callArg = mockPatientCreate.mock.calls[0][0]
      expect(callArg.data.additionalPhones.create).toHaveLength(2)
      expect(callArg.data.additionalPhones.create[0]).toMatchObject({
        clinicId: "clinic-1",
        phone: "5531888880000",
        label: "Mãe",
        notify: true,
      })
    })

    it("logs the audit row with edited fields when operator changed values", async () => {
      await callPATCH({ action: "approve", patient: operatorPatient })
      const auditArgs = mockAuditLog.mock.calls[0][0]
      expect(auditArgs.action).toBe("INTAKE_APPROVED")
      expect(auditArgs.newValues.edited).toBe(true)
      expect(auditArgs.newValues.editedFields).toEqual(
        expect.arrayContaining(["sessionFee", "referenceProfessionalId", "therapeuticProject"]),
      )
    })

    it("falls back to the map-only path when no patient body is provided", async () => {
      await callPATCH({ action: "approve" })
      const auditArgs = mockAuditLog.mock.calls[0][0]
      expect(auditArgs.newValues.edited).toBe(false)
      expect(auditArgs.newValues.editedFields).toBeUndefined()
    })
  })
})
