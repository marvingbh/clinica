import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Pass-through the auth wrapper so we can drive the handler directly.
vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockPatientCreate = vi.fn()
const mockPatientFindUnique = vi.fn()
const mockClinicFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: {
      create: (...args: unknown[]) => mockPatientCreate(...args),
      findUnique: (...args: unknown[]) => mockPatientFindUnique(...args),
    },
    clinic: {
      findUnique: (...args: unknown[]) => mockClinicFindUnique(...args),
    },
  },
}))

const mockAuditLog = vi.fn()
vi.mock("@/lib/rbac", () => ({
  audit: { log: (...args: unknown[]) => mockAuditLog(...args) },
  AuditAction: { PATIENT_CREATED: "PATIENT_CREATED" },
}))

import { POST } from "./route"

const adminUser = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: null,
}

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/patients"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

async function callPOST(body: unknown, user = adminUser) {
  const handler = POST as unknown as (
    req: NextRequest,
    ctx: { user: typeof adminUser },
  ) => Promise<Response>
  return handler(makeRequest(body), { user })
}

const validBody = {
  name: "João da Silva",
  phone: "5531999990000",
  email: "joao@example.com",
  consentWhatsApp: false,
  consentEmail: false,
}

describe("POST /api/patients", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPatientFindUnique.mockResolvedValue(null)
    mockClinicFindUnique.mockResolvedValue({ billingMode: "PER_SESSION" })
    mockPatientCreate.mockResolvedValue({
      id: "patient-1",
      clinicId: "clinic-1",
      name: "João da Silva",
      additionalPhones: [],
    })
    mockAuditLog.mockResolvedValue(undefined)
  })

  it("creates a patient with minimal valid input", async () => {
    const res = await callPOST(validBody)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.patient.id).toBe("patient-1")
    expect(mockPatientCreate).toHaveBeenCalledOnce()
  })

  it("rejects invalid phone format", async () => {
    const res = await callPOST({ ...validBody, phone: "123" })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Dados inválidos")
  })

  it("rejects a missing name", async () => {
    const res = await callPOST({ ...validBody, name: "" })
    expect(res.status).toBe(400)
  })

  it("returns 409 when CPF already exists in the same clinic", async () => {
    mockPatientFindUnique.mockResolvedValueOnce({ id: "other", cpf: "12345678901" })
    const res = await callPOST({ ...validBody, cpf: "123.456.789-01" })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/CPF/)
  })

  it("scopes the CPF uniqueness check to the caller's clinic", async () => {
    await callPOST({ ...validBody, cpf: "12345678901" })
    expect(mockPatientFindUnique).toHaveBeenCalledWith({
      where: { clinicId_cpf: { clinicId: "clinic-1", cpf: "12345678901" } },
    })
  })

  it("normalizes the phone to digits-only on save", async () => {
    // The zod regex accepts an optional + prefix; the create handler
    // strips non-digits before persisting.
    await callPOST({ ...validBody, phone: "+5531999990000" })
    const call = mockPatientCreate.mock.calls[0][0]
    expect(call.data.phone).toBe("5531999990000")
  })

  it("rejects when the same phone appears in primary + additional phones", async () => {
    const res = await callPOST({
      ...validBody,
      additionalPhones: [{ phone: "5531999990000", label: "Pai", notify: true }],
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/duplicad/i)
  })

  it("nests additionalPhones under the create call", async () => {
    await callPOST({
      ...validBody,
      additionalPhones: [
        { phone: "5531888880000", label: "Mãe", notify: true },
        { phone: "5531777770000", label: "Pai", notify: false },
      ],
    })
    const call = mockPatientCreate.mock.calls[0][0]
    expect(call.data.additionalPhones.create).toHaveLength(2)
    expect(call.data.additionalPhones.create[0]).toMatchObject({
      clinicId: "clinic-1",
      phone: "5531888880000",
      label: "Mãe",
      notify: true,
    })
  })

  it("stamps consentWhatsAppAt when consentWhatsApp is true", async () => {
    await callPOST({ ...validBody, consentWhatsApp: true })
    const call = mockPatientCreate.mock.calls[0][0]
    expect(call.data.consentWhatsApp).toBe(true)
    expect(call.data.consentWhatsAppAt).toBeInstanceOf(Date)
  })

  it("nulls consentEmailAt when consentEmail is false", async () => {
    await callPOST({ ...validBody, consentEmail: false })
    const call = mockPatientCreate.mock.calls[0][0]
    expect(call.data.consentEmail).toBe(false)
    expect(call.data.consentEmailAt).toBeNull()
  })

  it("rejects PER_SESSION grouping when clinic billingMode is MONTHLY_FIXED", async () => {
    mockClinicFindUnique.mockResolvedValueOnce({ billingMode: "MONTHLY_FIXED" })
    const res = await callPOST({ ...validBody, invoiceGrouping: "PER_SESSION" })
    expect(res.status).toBe(400)
  })

  it("logs an audit entry on successful create", async () => {
    await callPOST(validBody)
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PATIENT_CREATED",
        entityType: "Patient",
        entityId: "patient-1",
      }),
    )
  })
})
