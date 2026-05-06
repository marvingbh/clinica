import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockTxFindFirst = vi.fn()
const mockRefundLinkCreate = vi.fn()
const mockRefundLinkFindFirst = vi.fn()
const mockRefundLinkDelete = vi.fn()

const txClient = {
  bankTransaction: {
    findFirst: (...a: unknown[]) => mockTxFindFirst(...a),
  },
  transactionRefundLink: {
    create: (...a: unknown[]) => mockRefundLinkCreate(...a),
  },
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transactionRefundLink: {
      findFirst: (...a: unknown[]) => mockRefundLinkFindFirst(...a),
      delete: (...a: unknown[]) => mockRefundLinkDelete(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient),
  },
}))

const mockAuditLog = vi.fn()
vi.mock("@/lib/rbac", () => ({
  audit: { log: (...a: unknown[]) => mockAuditLog(...a) },
  AuditAction: {
    TRANSACTION_REFUND_LINK_CREATED: "TRANSACTION_REFUND_LINK_CREATED",
    TRANSACTION_REFUND_LINK_DELETED: "TRANSACTION_REFUND_LINK_DELETED",
  },
}))

import { POST, DELETE } from "./route"

const adminUser = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: null,
}

function makeRequest(url: string, body: unknown = null, method = "POST") {
  return new NextRequest(new URL(url), {
    method,
    body: body !== null ? JSON.stringify(body) : undefined,
    headers: body !== null ? { "Content-Type": "application/json" } : {},
  })
}

async function callPOST(body: unknown) {
  const handler = POST as unknown as (req: NextRequest, ctx: { user: typeof adminUser }) => Promise<Response>
  return handler(
    makeRequest("http://localhost/api/financeiro/conciliacao/refund-links", body, "POST"),
    { user: adminUser },
  )
}
async function callDELETE(query: string) {
  const handler = DELETE as unknown as (req: NextRequest, ctx: { user: typeof adminUser }) => Promise<Response>
  return handler(
    makeRequest(`http://localhost/api/financeiro/conciliacao/refund-links?${query}`, null, "DELETE"),
    { user: adminUser },
  )
}

const baseCredit = {
  id: "credit-1",
  clinicId: "clinic-1",
  amount: 250,
  type: "CREDIT",
  dismissReason: null,
  reconciliationLinks: [{ amount: 200 }], // partially reconciled
  refundLinksAsCredit: [],
}
const baseDebit = {
  id: "debit-1",
  clinicId: "clinic-1",
  amount: 50,
  type: "DEBIT",
  dismissReason: null,
  expenseReconciliationLinks: [],
  refundLinksAsDebit: [],
}

describe("POST /api/financeiro/conciliacao/refund-links", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTxFindFirst.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "credit-1") return Promise.resolve(baseCredit)
      if (where.id === "debit-1") return Promise.resolve(baseDebit)
      return Promise.resolve(null)
    })
    mockRefundLinkCreate.mockResolvedValue({ id: "link-1" })
    mockAuditLog.mockResolvedValue(undefined)
  })

  it("creates a link when credit + debit + amount are valid", async () => {
    const res = await callPOST({
      creditTransactionId: "credit-1",
      debitTransactionId: "debit-1",
      amount: 50,
    })
    expect(res.status).toBe(201)
    expect(mockRefundLinkCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clinicId: "clinic-1",
        creditTransactionId: "credit-1",
        debitTransactionId: "debit-1",
        amount: 50,
        linkedByUserId: "user-1",
      }),
    })
  })

  it("logs an audit entry on success", async () => {
    await callPOST({ creditTransactionId: "credit-1", debitTransactionId: "debit-1", amount: 50 })
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TRANSACTION_REFUND_LINK_CREATED",
        entityType: "TransactionRefundLink",
      }),
    )
  })

  it("rejects when amount exceeds the credit's remaining", async () => {
    const res = await callPOST({
      creditTransactionId: "credit-1",
      debitTransactionId: "debit-1",
      amount: 100, // credit has only 50 leftover
    })
    expect(res.status).toBe(400)
    expect(mockRefundLinkCreate).not.toHaveBeenCalled()
  })

  it("rejects when amount exceeds the debit's remaining", async () => {
    const res = await callPOST({
      creditTransactionId: "credit-1",
      debitTransactionId: "debit-1",
      amount: 60, // debit is only 50
    })
    expect(res.status).toBe(400)
  })

  it("rejects when the credit isn't actually a CREDIT", async () => {
    mockTxFindFirst.mockImplementationOnce(() =>
      Promise.resolve({ ...baseCredit, type: "DEBIT" }),
    )
    const res = await callPOST({
      creditTransactionId: "credit-1",
      debitTransactionId: "debit-1",
      amount: 50,
    })
    expect(res.status).toBe(400)
  })

  it("rejects when either transaction is dismissed", async () => {
    mockTxFindFirst.mockImplementationOnce(() =>
      Promise.resolve({ ...baseCredit, dismissReason: "DUPLICATE" }),
    )
    const res = await callPOST({
      creditTransactionId: "credit-1",
      debitTransactionId: "debit-1",
      amount: 50,
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when a transaction belongs to another clinic", async () => {
    mockTxFindFirst.mockImplementation(() => Promise.resolve(null))
    const res = await callPOST({
      creditTransactionId: "tx-other-clinic",
      debitTransactionId: "debit-1",
      amount: 50,
    })
    expect(res.status).toBe(404)
  })

  it("rejects when both ids are equal", async () => {
    const res = await callPOST({
      creditTransactionId: "x",
      debitTransactionId: "x",
      amount: 10,
    })
    expect(res.status).toBe(400)
  })

  it("returns 409 on Prisma unique constraint violation (double-link)", async () => {
    const dupErr = Object.assign(new Error("unique"), {
      code: "P2002",
      clientVersion: "test",
      meta: {},
    })
    Object.setPrototypeOf(dupErr, (await import("@prisma/client")).Prisma.PrismaClientKnownRequestError.prototype)
    mockRefundLinkCreate.mockRejectedValueOnce(dupErr)
    const res = await callPOST({
      creditTransactionId: "credit-1",
      debitTransactionId: "debit-1",
      amount: 50,
    })
    expect(res.status).toBe(409)
  })
})

describe("DELETE /api/financeiro/conciliacao/refund-links", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefundLinkDelete.mockResolvedValue({})
    mockAuditLog.mockResolvedValue(undefined)
  })

  it("deletes the link and audits", async () => {
    mockRefundLinkFindFirst.mockResolvedValueOnce({
      id: "link-1",
      creditTransactionId: "credit-1",
      debitTransactionId: "debit-1",
      amount: 50,
    })
    const res = await callDELETE("id=link-1")
    expect(res.status).toBe(200)
    expect(mockRefundLinkDelete).toHaveBeenCalledWith({ where: { id: "link-1" } })
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TRANSACTION_REFUND_LINK_DELETED" }),
    )
  })

  it("returns 404 for a missing or cross-clinic link", async () => {
    mockRefundLinkFindFirst.mockResolvedValueOnce(null)
    const res = await callDELETE("id=missing")
    expect(res.status).toBe(404)
    expect(mockRefundLinkDelete).not.toHaveBeenCalled()
  })

  it("returns 400 when id is missing", async () => {
    const res = await callDELETE("")
    expect(res.status).toBe(400)
  })
})
