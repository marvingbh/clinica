import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildRealized } from "./build-realized"

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankTransaction: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    expense: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"

const mockPrisma = prisma as unknown as {
  bankTransaction: { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> }
  invoice: { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> }
  expense: { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> }
}

const clinicId = "clinic-1"
const startDate = new Date("2026-04-01")
const endDate = new Date("2026-04-30")

describe("buildRealized", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ------- Path selection -------

  it("uses bank transactions path when interBalance is provided", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 10000,
      balanceFetchedAt: new Date("2026-04-15"),
    })

    expect(result.balanceSource).toBe("inter")
    expect(mockPrisma.bankTransaction.findMany).toHaveBeenCalled()
    expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled()
  })

  it("uses invoices/expenses fallback when interBalance is null", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([])
    mockPrisma.expense.findMany.mockResolvedValue([])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    expect(result.balanceSource).toBe("computed")
    expect(mockPrisma.invoice.findMany).toHaveBeenCalled()
    expect(mockPrisma.bankTransaction.findMany).not.toHaveBeenCalled()
  })

  // ------- Bank transactions path -------

  it("computes starting balance from interBalance minus net bank movement", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 3000 } }) // credits
      .mockResolvedValueOnce({ _sum: { amount: 1000 } }) // debits

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 15000,
      balanceFetchedAt: new Date("2026-04-15"),
    })

    // startingBalance = 15000 - (3000 - 1000) = 13000
    expect(result.startingBalance).toBe(13000)
  })

  it("maps reconciled credit transactions to invoices with patient names", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: "bt-1", date: new Date("2026-04-05"), amount: 500, type: "CREDIT",
        description: "PIX recebido",
        reconciliationLinks: [
          { amount: 500, invoice: { id: "inv-10", patient: { name: "Maria Silva" } } },
        ],
        expenseReconciliationLinks: [],
      },
    ])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 5000,
      balanceFetchedAt: new Date("2026-04-10"),
    })

    expect(result.invoicesForCF).toHaveLength(1)
    expect(result.invoicesForCF[0]).toMatchObject({
      id: "bt-bt-1-inv-inv-10",
      totalAmount: 500,
      status: "PAGO",
      patientName: "Maria Silva",
    })
    expect(result.invoicesForCF[0].paidAt).toEqual(new Date("2026-04-05"))
  })

  it("maps unreconciled credit transactions with warning label", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: "bt-2", date: new Date("2026-04-07"), amount: 750, type: "CREDIT",
        description: "Transferencia",
        reconciliationLinks: [],
        expenseReconciliationLinks: [],
      },
    ])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 5000,
      balanceFetchedAt: new Date("2026-04-10"),
    })

    expect(result.invoicesForCF).toHaveLength(1)
    expect(result.invoicesForCF[0].patientName).toContain("Não conciliado")
    expect(result.invoicesForCF[0].patientName).toContain("Transferencia")
    expect(result.invoicesForCF[0].totalAmount).toBe(750)
  })

  it("maps reconciled debit transactions to expenses", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: "bt-3", date: new Date("2026-04-03"), amount: 2000, type: "DEBIT",
        description: "Pagamento",
        reconciliationLinks: [],
        expenseReconciliationLinks: [
          { amount: 2000, expense: { id: "exp-5", description: "Aluguel escritorio" } },
        ],
      },
    ])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 5000,
      balanceFetchedAt: new Date("2026-04-10"),
    })

    expect(result.expensesForCF).toHaveLength(1)
    expect(result.expensesForCF[0]).toMatchObject({
      id: "bt-bt-3-exp-exp-5",
      description: "Aluguel escritorio",
      amount: 2000,
      status: "PAID",
    })
  })

  it("maps unreconciled debit transactions with warning label", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: "bt-4", date: new Date("2026-04-12"), amount: 300, type: "DEBIT",
        description: "TED para fornecedor",
        reconciliationLinks: [],
        expenseReconciliationLinks: [],
      },
    ])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 5000,
      balanceFetchedAt: new Date("2026-04-10"),
    })

    expect(result.expensesForCF).toHaveLength(1)
    expect(result.expensesForCF[0].description).toContain("Não conciliado")
    expect(result.expensesForCF[0].description).toContain("TED para fornecedor")
  })

  it("handles mixed credit and debit transactions", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: "bt-c1", date: new Date("2026-04-02"), amount: 1000, type: "CREDIT",
        description: "PIX",
        reconciliationLinks: [],
        expenseReconciliationLinks: [],
      },
      {
        id: "bt-d1", date: new Date("2026-04-03"), amount: 400, type: "DEBIT",
        description: "Energia",
        reconciliationLinks: [],
        expenseReconciliationLinks: [],
      },
      {
        id: "bt-c2", date: new Date("2026-04-04"), amount: 600, type: "CREDIT",
        description: "Consulta",
        reconciliationLinks: [
          { amount: 600, invoice: { id: "inv-99", patient: { name: "Joao" } } },
        ],
        expenseReconciliationLinks: [],
      },
    ])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 5000,
      balanceFetchedAt: new Date("2026-04-10"),
    })

    expect(result.invoicesForCF).toHaveLength(2)
    expect(result.expensesForCF).toHaveLength(1)
  })

  it("handles multiple reconciliation links on a single credit transaction", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: "bt-multi", date: new Date("2026-04-05"), amount: 1200, type: "CREDIT",
        description: "Deposito",
        reconciliationLinks: [
          { amount: 700, invoice: { id: "inv-a", patient: { name: "Ana" } } },
          { amount: 500, invoice: { id: "inv-b", patient: { name: "Bruno" } } },
        ],
        expenseReconciliationLinks: [],
      },
    ])
    mockPrisma.bankTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: 5000,
      balanceFetchedAt: new Date("2026-04-10"),
    })

    expect(result.invoicesForCF).toHaveLength(2)
    expect(result.invoicesForCF[0].totalAmount).toBe(700)
    expect(result.invoicesForCF[0].patientName).toBe("Ana")
    expect(result.invoicesForCF[1].totalAmount).toBe(500)
    expect(result.invoicesForCF[1].patientName).toBe("Bruno")
  })

  // ------- Invoices/expenses fallback path -------

  it("computes starting balance from historical invoice/expense totals", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([])
    mockPrisma.expense.findMany.mockResolvedValue([])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 50000 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 20000 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    expect(result.startingBalance).toBe(30000) // 50000 - 20000
  })

  it("maps paid invoices to InvoiceForCashFlow with correct fields", async () => {
    const paidAt = new Date("2026-04-10")
    const dueDate = new Date("2026-04-15")
    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", totalAmount: 1500, dueDate, paidAt, status: "PAGO", patient: { name: "Clara" } },
    ])
    mockPrisma.expense.findMany.mockResolvedValue([])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    expect(result.invoicesForCF).toHaveLength(1)
    expect(result.invoicesForCF[0]).toMatchObject({
      id: "inv-1",
      totalAmount: 1500,
      dueDate,
      paidAt,
      status: "PAGO",
      patientName: "Clara",
    })
  })

  it("maps paid expenses to ExpenseForCashFlow with correct fields", async () => {
    const paidAt = new Date("2026-04-05")
    const dueDate = new Date("2026-04-10")
    mockPrisma.invoice.findMany.mockResolvedValue([])
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: "exp-1", description: "Aluguel", amount: 3000, dueDate, paidAt, status: "PAID" },
    ])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    expect(result.expensesForCF).toHaveLength(1)
    expect(result.expensesForCF[0]).toMatchObject({
      id: "exp-1",
      description: "Aluguel",
      amount: 3000,
      dueDate,
      paidAt,
      status: "PAID",
    })
  })

  it("converts Decimal-like amounts to numbers", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: "inv-d", totalAmount: "250.50", dueDate: new Date("2026-04-10"), paidAt: new Date("2026-04-10"), status: "PAGO", patient: { name: "Test" } },
    ])
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: "exp-d", description: "Energia", amount: "180.75", dueDate: new Date("2026-04-05"), paidAt: new Date("2026-04-05"), status: "PAID" },
    ])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    expect(typeof result.invoicesForCF[0].totalAmount).toBe("number")
    expect(result.invoicesForCF[0].totalAmount).toBe(250.50)
    expect(typeof result.expensesForCF[0].amount).toBe("number")
    expect(result.expensesForCF[0].amount).toBe(180.75)
  })

  it("handles null dueDate on invoice by falling back to current date", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: "inv-nd", totalAmount: 100, dueDate: null, paidAt: new Date("2026-04-10"), status: "PAGO", patient: { name: "Test" } },
    ])
    mockPrisma.expense.findMany.mockResolvedValue([])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    // When dueDate is null, code uses `inv.dueDate ?? new Date()`
    expect(result.invoicesForCF[0].dueDate).toBeInstanceOf(Date)
  })

  it("handles null aggregate sums gracefully", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([])
    mockPrisma.expense.findMany.mockResolvedValue([])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: null } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    expect(result.startingBalance).toBe(0)
  })

  it("returns empty arrays when no invoices or expenses exist", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([])
    mockPrisma.expense.findMany.mockResolvedValue([])
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })

    const result = await buildRealized({
      clinicId, startDate, endDate,
      interBalance: null,
      balanceFetchedAt: null,
    })

    expect(result.invoicesForCF).toEqual([])
    expect(result.expensesForCF).toEqual([])
    expect(result.startingBalance).toBe(0)
    expect(result.balanceSource).toBe("computed")
  })
})
