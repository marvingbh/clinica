import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockBankTxFindFirst = vi.fn()
const mockBankTxFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankTransaction: {
      findFirst: (...a: unknown[]) => mockBankTxFindFirst(...a),
      findMany: (...a: unknown[]) => mockBankTxFindMany(...a),
    },
  },
}))

import { GET } from "./route"

const adminUser = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: null,
}

function makeRequest(query: string) {
  return new NextRequest(
    new URL(`http://localhost/api/financeiro/conciliacao/refund-candidates?${query}`),
  )
}

async function callGET(query: string) {
  const handler = GET as unknown as (req: NextRequest, ctx: { user: typeof adminUser }) => Promise<Response>
  return handler(makeRequest(query), { user: adminUser })
}

describe("GET /api/financeiro/conciliacao/refund-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("400 when neither id is provided", async () => {
    const res = await callGET("")
    expect(res.status).toBe(400)
  })

  it("400 when both ids are provided", async () => {
    const res = await callGET("creditTransactionId=a&debitTransactionId=b")
    expect(res.status).toBe(400)
  })

  it("404 when source transaction not found in caller's clinic", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce(null)
    const res = await callGET("creditTransactionId=missing")
    expect(res.status).toBe(404)
  })

  it("400 when source transaction is dismissed", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "credit-1",
      type: "CREDIT",
      amount: 250,
      date: new Date("2026-05-06"),
      payerName: "X",
      dismissReason: "DUPLICATE",
      reconciliationLinks: [],
      refundLinksAsCredit: [],
      expenseReconciliationLinks: [],
      refundLinksAsDebit: [],
    })
    const res = await callGET("creditTransactionId=credit-1")
    expect(res.status).toBe(400)
  })

  it("returns empty when source has no remaining (fully allocated)", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "credit-1",
      type: "CREDIT",
      amount: 200,
      date: new Date("2026-05-06"),
      payerName: "X",
      dismissReason: null,
      reconciliationLinks: [{ amount: 200, invoice: { patient: null } }],
      refundLinksAsCredit: [],
      expenseReconciliationLinks: [],
      refundLinksAsDebit: [],
    })
    const res = await callGET("creditTransactionId=credit-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.candidates).toEqual([])
    expect(body.remainingAmount).toBe(0)
  })

  it("ranks candidates with the matching debit at the top", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "credit-1",
      type: "CREDIT",
      amount: 250,
      date: new Date("2026-05-06"),
      payerName: "MIRELA C L CAVALCANTE",
      dismissReason: null,
      reconciliationLinks: [
        {
          amount: 200,
          invoice: { patient: { name: "Filha", motherName: "Mirela", fatherName: null } },
        },
      ],
      refundLinksAsCredit: [],
      expenseReconciliationLinks: [],
      refundLinksAsDebit: [],
    })
    mockBankTxFindMany.mockResolvedValueOnce([
      {
        id: "debit-noise",
        type: "DEBIT",
        amount: 80,
        date: new Date("2026-05-04"),
        payerName: "FORNECEDOR DIVERSO",
        description: null,
        reconciliationLinks: [],
        refundLinksAsCredit: [],
        expenseReconciliationLinks: [],
        refundLinksAsDebit: [],
      },
      {
        id: "debit-match",
        type: "DEBIT",
        amount: 50,
        date: new Date("2026-05-07"),
        payerName: "MIRELA",
        description: null,
        reconciliationLinks: [],
        refundLinksAsCredit: [],
        expenseReconciliationLinks: [],
        refundLinksAsDebit: [],
      },
    ])

    const res = await callGET("creditTransactionId=credit-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.remainingAmount).toBe(50)
    expect(body.candidates[0].id).toBe("debit-match")
  })

  it("only considers candidates of the opposite type", async () => {
    mockBankTxFindFirst.mockResolvedValueOnce({
      id: "credit-1",
      type: "CREDIT",
      amount: 250,
      date: new Date("2026-05-06"),
      payerName: "MIRELA",
      dismissReason: null,
      reconciliationLinks: [{ amount: 200, invoice: { patient: null } }],
      refundLinksAsCredit: [],
      expenseReconciliationLinks: [],
      refundLinksAsDebit: [],
    })
    mockBankTxFindMany.mockResolvedValueOnce([])

    await callGET("creditTransactionId=credit-1")

    const findManyArgs = mockBankTxFindMany.mock.calls[0][0]
    expect(findManyArgs.where.type).toBe("DEBIT")
    expect(findManyArgs.where.dismissReason).toBeNull()
    expect(findManyArgs.where.clinicId).toBe("clinic-1")
  })
})
