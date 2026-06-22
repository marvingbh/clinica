import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockFetchStatements = vi.fn()
const mockFetchBalance = vi.fn()

vi.mock("@/lib/bank-reconciliation", () => ({
  fetchStatements: (...a: unknown[]) => mockFetchStatements(...a),
  fetchBalance: (...a: unknown[]) => mockFetchBalance(...a),
}))

const mockIntegrationFindFirst = vi.fn()
const mockIntegrationUpdate = vi.fn()
const mockDeleteMany = vi.fn()
const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpsert = vi.fn()
const mockUpdate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankIntegration: {
      findFirst: (...a: unknown[]) => mockIntegrationFindFirst(...a),
      update: (...a: unknown[]) => mockIntegrationUpdate(...a),
    },
    bankTransaction: {
      deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      upsert: (...a: unknown[]) => mockUpsert(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}))

import { POST } from "./route"

const adminUser = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: null,
}

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/financeiro/conciliacao/fetch"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

async function callPOST(body: unknown = {}, user = adminUser) {
  const handler = POST as unknown as (req: NextRequest, ctx: { user: typeof adminUser }) => Promise<Response>
  return handler(makeRequest(body), { user })
}

const today = new Date().toISOString().split("T")[0]

describe("POST /api/financeiro/conciliacao/fetch — refund-linked credit preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIntegrationFindFirst.mockResolvedValue({
      id: "integ-1",
      clientId: "c",
      clientSecret: "s",
      certificate: "cert",
      privateKey: "key",
    })
    mockFetchStatements.mockResolvedValue([
      { externalId: "fit-credit", date: today, amount: 100, description: "PIX recebido", payerName: "Fulano", type: "CREDIT" },
      { externalId: "fit-debit", date: today, amount: 50, description: "Pagamento", payerName: null, type: "DEBIT" },
    ])
    mockDeleteMany.mockResolvedValue({ count: 0 })
    mockFindMany.mockResolvedValue([])
    mockFindUnique.mockResolvedValue(null)
    mockUpsert.mockResolvedValue({})
    mockUpdate.mockResolvedValue({})
    mockIntegrationUpdate.mockResolvedValue({})
    mockFetchBalance.mockResolvedValue(1234.56)
  })

  it("excludes refund-source credits from the pre-import deletion", async () => {
    const res = await callPOST()
    expect(res.status).toBe(200)

    // The deletion must NOT remove credits that are the source of a devolução,
    // otherwise the cascade wipes the refund link and resurfaces the debit.
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          type: "CREDIT",
          reconciliationLinks: { none: {} },
          refundLinksAsCredit: { none: {} },
          dismissReason: null,
        }),
      }),
    )
  })

  it("treats refund-linked credits as manually handled when migrating externalIds", async () => {
    await callPOST()

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          OR: expect.arrayContaining([
            { reconciliationLinks: { some: {} } },
            { refundLinksAsCredit: { some: {} } },
          ]),
        }),
      }),
    )
  })

  it("returns 400 when no active bank integration exists", async () => {
    mockIntegrationFindFirst.mockResolvedValueOnce(null)
    const res = await callPOST()
    expect(res.status).toBe(400)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })
})
