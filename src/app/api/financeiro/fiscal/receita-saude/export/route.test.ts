import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: (...args: unknown[]) => unknown) => handler,
  forbiddenResponse: (message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 403 }),
}))

vi.mock("@/lib/rbac/audit", () => ({
  audit: { log: vi.fn().mockResolvedValue(undefined) },
  AuditAction: { RECIBO_SAUDE_BATCH_EXPORTED: "RECIBO_SAUDE_BATCH_EXPORTED" },
}))

const mockAssertProfessional = vi.fn()
vi.mock("@/lib/clinic/ownership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clinic/ownership")>("@/lib/clinic/ownership")
  return { ...actual, assertProfessionalInClinic: (...a: unknown[]) => mockAssertProfessional(...a) }
})

const mockProfFindMany = vi.fn()
const mockInvFindMany = vi.fn()
const mockEmissionFindMany = vi.fn()
const mockBatchCreate = vi.fn()
const mockEmissionUpsert = vi.fn()

const txClient = {
  reciboSaudeBatch: { create: (...a: unknown[]) => mockBatchCreate(...a) },
  reciboSaudeEmission: { upsert: (...a: unknown[]) => mockEmissionUpsert(...a) },
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionalProfile: { findMany: (...a: unknown[]) => mockProfFindMany(...a) },
    invoice: { findMany: (...a: unknown[]) => mockInvFindMany(...a) },
    reciboSaudeEmission: { findMany: (...a: unknown[]) => mockEmissionFindMany(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient),
  },
}))

import { POST } from "./route"

const adminUser = { id: "u1", clinicId: "c1", role: "ADMIN" as const, professionalProfileId: null }
const profUser = { id: "u2", clinicId: "c1", role: "PROFESSIONAL" as const, professionalProfileId: "prof1" }

function call(body: unknown, user: typeof adminUser | typeof profUser = adminUser) {
  const req = new NextRequest(new URL("http://localhost/x"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
  const handler = POST as unknown as (r: NextRequest, c: { user: typeof user }) => Promise<Response>
  return handler(req, { user })
}

const VALID = {
  benefCpf: "52998224725",
  payerCpf: "39053344705",
  profCpf: "11144477735",
}

function profRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "prof1",
    cpf: VALID.profCpf,
    registrationNumber: "CRP06/1",
    fiscalRegime: "PF",
    fiscalRegimeSince: null,
    user: { name: "Ana" },
    ...overrides,
  }
}

function invoiceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    patientId: "pat1",
    professionalProfileId: "prof1",
    status: "PARCIAL",
    totalAmount: 200,
    paidAt: null,
    patient: {
      id: "pat1",
      name: "Maria",
      cpf: VALID.benefCpf,
      birthDate: new Date("2010-05-20"),
      billingCpf: VALID.payerCpf,
      billingResponsibleName: "Pai",
    },
    reconciliationLinks: [
      {
        id: "l1",
        amount: 200,
        transaction: { date: new Date("2025-02-05"), refundLinksAsCredit: [] },
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertProfessional.mockResolvedValue(undefined)
  mockEmissionFindMany.mockResolvedValue([])
  mockBatchCreate.mockResolvedValue({ id: "batch1" })
  mockEmissionUpsert.mockResolvedValue({})
})

describe("POST receita-saude/export", () => {
  it("creates a batch + EXPORTADO emissions for a clean selection", async () => {
    mockProfFindMany.mockResolvedValue([profRecord()])
    mockInvFindMany.mockResolvedValue([invoiceRecord()])

    const res = await call({ professionalProfileId: "prof1", paymentKeys: ["recl:l1"], year: 2025 })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.batchId).toBe("batch1")
    expect(json.fileContent).toContain("recl:l1")
    expect(mockBatchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clinicId: "c1", itemCount: 1 }) })
    )
    expect(mockEmissionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ paymentKey: "recl:l1", status: "EXPORTADO" }),
      })
    )
  })

  it("returns 422 when a selected row has a blocker (self-pay beneficiary without CPF)", async () => {
    mockProfFindMany.mockResolvedValue([profRecord()])
    mockInvFindMany.mockResolvedValue([
      invoiceRecord({
        // No CPF AND no financial responsible → genuinely blocked (a minor with a
        // billingCpf responsible would NOT be blocked, by design).
        patient: { ...invoiceRecord().patient, cpf: null, billingCpf: null },
      }),
    ])

    const res = await call({ professionalProfileId: "prof1", paymentKeys: ["recl:l1"], year: 2025 })
    expect(res.status).toBe(422)
    expect(mockBatchCreate).not.toHaveBeenCalled()
  })

  it("returns 403 when a PROFESSIONAL exports another professional's batch", async () => {
    const res = await call({ professionalProfileId: "prof-other", paymentKeys: ["recl:l1"] }, profUser)
    expect(res.status).toBe(403)
    expect(mockBatchCreate).not.toHaveBeenCalled()
  })

  it("returns 404 when the professional belongs to another clinic", async () => {
    const { OwnershipError } = await import("@/lib/clinic/ownership")
    mockAssertProfessional.mockRejectedValue(new OwnershipError())
    const res = await call({ professionalProfileId: "prof1", paymentKeys: ["recl:l1"] })
    expect(res.status).toBe(404)
  })
})
