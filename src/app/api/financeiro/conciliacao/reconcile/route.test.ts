import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Pass-through auth so we can drive the handler directly.
vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

vi.mock("@/lib/bank-reconciliation", () => ({
  computeInvoiceStatus: (paid: number, total: number) =>
    paid >= total - 0.01 ? "PAGO" : paid > 0.01 ? "PARCIAL" : "PENDENTE",
  normalizeForComparison: (s: string) => s.toLowerCase().trim(),
}))

const mockTxFindMany = vi.fn()
const mockInvFindMany = vi.fn()
const mockInvFindUniqueOrThrow = vi.fn()
const mockInvUpdate = vi.fn()
const mockReconcileFindMany = vi.fn()
const mockReconcileFindFirst = vi.fn()
const mockReconcileCreate = vi.fn()
const mockReconcileDeleteMany = vi.fn()
const mockUsualPayerUpsert = vi.fn()
const mockBankTxFindFirst = vi.fn()

const txClient = {
  reconciliationLink: {
    findMany: (...a: unknown[]) => mockReconcileFindMany(...a),
    findFirst: (...a: unknown[]) => mockReconcileFindFirst(...a),
    create: (...a: unknown[]) => mockReconcileCreate(...a),
    deleteMany: (...a: unknown[]) => mockReconcileDeleteMany(...a),
  },
  invoice: {
    update: (...a: unknown[]) => mockInvUpdate(...a),
    findUniqueOrThrow: (...a: unknown[]) => mockInvFindUniqueOrThrow(...a),
  },
  patientUsualPayer: {
    upsert: (...a: unknown[]) => mockUsualPayerUpsert(...a),
  },
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankTransaction: {
      findMany: (...a: unknown[]) => mockTxFindMany(...a),
      findFirst: (...a: unknown[]) => mockBankTxFindFirst(...a),
    },
    invoice: {
      findMany: (...a: unknown[]) => mockInvFindMany(...a),
    },
    reconciliationLink: {
      findFirst: (...a: unknown[]) => mockReconcileFindFirst(...a),
      findMany: (...a: unknown[]) => mockReconcileFindMany(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient),
  },
}))

import { POST, DELETE } from "./route"

const adminUser = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: null,
}

function makeRequest(body: unknown, method = "POST") {
  return new NextRequest(new URL("http://localhost/api/financeiro/conciliacao/reconcile"), {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

async function callPOST(body: unknown, user = adminUser) {
  const handler = POST as unknown as (req: NextRequest, ctx: { user: typeof adminUser }) => Promise<Response>
  return handler(makeRequest(body), { user })
}
async function callDELETE(body: unknown, user = adminUser) {
  const handler = DELETE as unknown as (req: NextRequest, ctx: { user: typeof adminUser }) => Promise<Response>
  return handler(makeRequest(body, "DELETE"), { user })
}

describe("POST /api/financeiro/conciliacao/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReconcileFindMany.mockResolvedValue([]) // no existing links
    mockReconcileCreate.mockResolvedValue({ id: "link-new" })
    mockInvUpdate.mockResolvedValue({})
    mockUsualPayerUpsert.mockResolvedValue({})
  })

  it("creates the link, scopes by clinicId, and updates invoice status", async () => {
    mockTxFindMany.mockResolvedValueOnce([{ id: "tx-1", amount: 200, payerName: "MIRELA" }])
    mockInvFindMany.mockResolvedValueOnce([
      { id: "inv-1", totalAmount: 200, status: "PENDENTE", patientId: "p-1" },
    ])

    const res = await callPOST({
      links: [{ transactionId: "tx-1", invoiceId: "inv-1", amount: 200 }],
    })

    expect(res.status).toBe(200)
    expect(mockReconcileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicId: "clinic-1",
          transactionId: "tx-1",
          invoiceId: "inv-1",
          amount: 200,
        }),
      }),
    )
    // Invoice transitioned to PAGO (paid 200 of 200)
    expect(mockInvUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({ status: "PAGO" }),
      }),
    )
  })

  it("rejects over-allocation on the invoice (>total + 0.01)", async () => {
    mockTxFindMany.mockResolvedValueOnce([{ id: "tx-1", amount: 200, payerName: null }])
    mockInvFindMany.mockResolvedValueOnce([
      { id: "inv-1", totalAmount: 200, status: "PENDENTE", patientId: "p-1" },
    ])

    const res = await callPOST({
      links: [{ transactionId: "tx-1", invoiceId: "inv-1", amount: 250 }],
    })

    expect(res.status).toBe(400)
    expect(mockReconcileCreate).not.toHaveBeenCalled()
  })

  it("returns 404 when the transaction belongs to another clinic", async () => {
    // findMany filtered by clinicId: returns nothing for cross-clinic
    mockTxFindMany.mockResolvedValueOnce([])
    mockInvFindMany.mockResolvedValueOnce([])
    const res = await callPOST({
      links: [{ transactionId: "other-clinic-tx", invoiceId: "inv-1", amount: 100 }],
    })
    expect(res.status).toBe(404)
  })

  it("upserts PatientUsualPayer when the transaction has a payerName", async () => {
    mockTxFindMany.mockResolvedValueOnce([{ id: "tx-1", amount: 200, payerName: "MIRELA C L CAVALCANTE" }])
    mockInvFindMany.mockResolvedValueOnce([
      { id: "inv-1", totalAmount: 200, status: "PENDENTE", patientId: "p-1" },
    ])

    await callPOST({ links: [{ transactionId: "tx-1", invoiceId: "inv-1", amount: 200 }] })

    expect(mockUsualPayerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId_payerName: expect.objectContaining({ patientId: "p-1" }),
        }),
        create: expect.objectContaining({ clinicId: "clinic-1", patientId: "p-1" }),
      }),
    )
  })

  it("rejects empty links payload", async () => {
    const res = await callPOST({ links: [] })
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/financeiro/conciliacao/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReconcileDeleteMany.mockResolvedValue({ count: 1 })
    mockInvUpdate.mockResolvedValue({})
    mockReconcileFindMany.mockResolvedValue([]) // no remaining links
    mockInvFindUniqueOrThrow.mockResolvedValue({ totalAmount: 200, paidAt: null })
  })

  it("deletes a single link by linkId and recomputes the invoice status", async () => {
    mockReconcileFindFirst.mockResolvedValueOnce({ id: "link-1", invoiceId: "inv-1" })

    const res = await callDELETE({ linkId: "link-1" })

    expect(res.status).toBe(200)
    expect(mockReconcileDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["link-1"] } } })
    // Invoice goes back to PENDENTE since no links remain
    expect(mockInvUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({ status: "PENDENTE" }),
      }),
    )
  })

  it("returns 404 when the link does not exist (or belongs to another clinic)", async () => {
    mockReconcileFindFirst.mockResolvedValueOnce(null)
    const res = await callDELETE({ linkId: "missing" })
    expect(res.status).toBe(404)
  })

  it("deletes all links for a transactionId", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({ id: "tx-1" })
    mockReconcileFindMany
      .mockResolvedValueOnce([
        { id: "link-1", invoiceId: "inv-1" },
        { id: "link-2", invoiceId: "inv-2" },
      ])
      // remaining links per affected invoice during recompute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await callDELETE({ transactionId: "tx-1" })

    expect(res.status).toBe(200)
    expect(mockReconcileDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["link-1", "link-2"] } } })
  })

  it("returns 404 when transactionId points at another clinic's transaction", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce(null)
    const res = await callDELETE({ transactionId: "cross-clinic" })
    expect(res.status).toBe(404)
  })
})
