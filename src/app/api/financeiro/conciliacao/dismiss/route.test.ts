import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockBankTxFindFirst = vi.fn()
const mockBankTxUpdate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankTransaction: {
      findFirst: (...a: unknown[]) => mockBankTxFindFirst(...a),
      update: (...a: unknown[]) => mockBankTxUpdate(...a),
    },
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
  return new NextRequest(new URL("http://localhost/api/financeiro/conciliacao/dismiss"), {
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

describe("POST /api/financeiro/conciliacao/dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBankTxUpdate.mockResolvedValue({})
  })

  it("dismisses an unreconciled transaction with the given reason", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      reconciliationLinks: [],
      refundLinksAsCredit: [],
      refundLinksAsDebit: [],
      dismissReason: null,
    })

    const res = await callPOST({ transactionId: "tx-1", reason: "DUPLICATE" })

    expect(res.status).toBe(200)
    expect(mockBankTxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx-1" },
        data: expect.objectContaining({
          dismissReason: "DUPLICATE",
          dismissedByUserId: "user-1",
        }),
      }),
    )
  })

  it("scopes the lookup to the caller's clinicId", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      reconciliationLinks: [],
      refundLinksAsCredit: [],
      refundLinksAsDebit: [],
      dismissReason: null,
    })

    await callPOST({ transactionId: "tx-1", reason: "NOT_PATIENT" })

    expect(mockBankTxFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "tx-1", clinicId: "clinic-1" }),
      }),
    )
  })

  it("returns 404 when the transaction does not exist (or another clinic's)", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce(null)
    const res = await callPOST({ transactionId: "tx-1", reason: "DUPLICATE" })
    expect(res.status).toBe(404)
    expect(mockBankTxUpdate).not.toHaveBeenCalled()
  })

  it("rejects dismissing a transaction that has reconciliation links", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      reconciliationLinks: [{ id: "link-1" }],
      refundLinksAsCredit: [],
      refundLinksAsDebit: [],
      dismissReason: null,
    })

    const res = await callPOST({ transactionId: "tx-1", reason: "DUPLICATE" })
    expect(res.status).toBe(400)
    expect(mockBankTxUpdate).not.toHaveBeenCalled()
  })

  it("rejects dismissing a transaction that has refund links", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      reconciliationLinks: [],
      refundLinksAsCredit: [{ id: "rl-1" }],
      refundLinksAsDebit: [],
      dismissReason: null,
    })

    const res = await callPOST({ transactionId: "tx-1", reason: "DUPLICATE" })
    expect(res.status).toBe(400)
    expect(mockBankTxUpdate).not.toHaveBeenCalled()
  })

  it("rejects dismissing an already-dismissed transaction", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      reconciliationLinks: [],
      refundLinksAsCredit: [],
      refundLinksAsDebit: [],
      dismissReason: "DUPLICATE",
    })

    const res = await callPOST({ transactionId: "tx-1", reason: "NOT_PATIENT" })
    expect(res.status).toBe(400)
    expect(mockBankTxUpdate).not.toHaveBeenCalled()
  })

  it("rejects unsupported reasons", async () => {
    const res = await callPOST({ transactionId: "tx-1", reason: "PERSONAL_EXPENSE" })
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/financeiro/conciliacao/dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBankTxUpdate.mockResolvedValue({})
  })

  it("clears the dismiss fields on a previously-dismissed transaction", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({ id: "tx-1" })
    const res = await callDELETE({ transactionId: "tx-1" })
    expect(res.status).toBe(200)
    expect(mockBankTxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx-1" },
        data: expect.objectContaining({
          dismissReason: null,
          dismissedAt: null,
          dismissedByUserId: null,
        }),
      }),
    )
  })

  it("returns 404 when the transaction is not dismissed", async () => {
    // findFirst includes `dismissReason: { not: null }` in the where clause,
    // so a non-dismissed transaction returns null.
    mockBankTxFindFirst.mockResolvedValueOnce(null)
    const res = await callDELETE({ transactionId: "tx-1" })
    expect(res.status).toBe(404)
  })
})
