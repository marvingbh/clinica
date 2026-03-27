import { prisma } from "@/lib/prisma"
import type { InvoiceForCashFlow, ExpenseForCashFlow } from "./types"

interface BuildRealizedParams {
  clinicId: string
  startDate: Date
  endDate: Date
  interBalance: number | null
  balanceFetchedAt: Date | null
}

interface BuildRealizedResult {
  invoicesForCF: InvoiceForCashFlow[]
  expensesForCF: ExpenseForCashFlow[]
  startingBalance: number
  balanceSource: "inter" | "computed" | "none"
}

export async function buildRealized({
  clinicId,
  startDate,
  endDate,
  interBalance,
  balanceFetchedAt,
}: BuildRealizedParams): Promise<BuildRealizedResult> {
  // When bank integration exists, use bank transactions as the source of truth
  if (interBalance !== null && balanceFetchedAt) {
    return buildFromBankTransactions({ clinicId, startDate, endDate, interBalance, balanceFetchedAt })
  }

  // Fallback: use invoices/expenses when no bank integration
  return buildFromInvoicesExpenses({ clinicId, startDate, endDate })
}

/**
 * Build cash flow from bank transactions (source of truth for cash position).
 * Links each transaction to its reconciled invoice/expense when available.
 * Unlinked transactions are marked as "Não conciliado" for tracking.
 */
async function buildFromBankTransactions({
  clinicId,
  startDate,
  endDate,
  interBalance,
  balanceFetchedAt,
}: {
  clinicId: string
  startDate: Date
  endDate: Date
  interBalance: number
  balanceFetchedAt: Date
}): Promise<BuildRealizedResult> {
  const transactions = await prisma.bankTransaction.findMany({
    where: { clinicId, date: { gte: startDate, lte: endDate } },
    select: {
      id: true,
      date: true,
      amount: true,
      type: true,
      description: true,
      reconciliationLinks: {
        select: {
          amount: true,
          invoice: { select: { id: true, patient: { select: { name: true } } } },
        },
      },
      expenseReconciliationLinks: {
        select: {
          amount: true,
          expense: { select: { id: true, description: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  })

  // Compute starting balance from bank transactions
  const [bankCredits, bankDebits] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: { clinicId, date: { gte: startDate, lte: balanceFetchedAt }, type: "CREDIT" },
      _sum: { amount: true },
    }),
    prisma.bankTransaction.aggregate({
      where: { clinicId, date: { gte: startDate, lte: balanceFetchedAt }, type: "DEBIT" },
      _sum: { amount: true },
    }),
  ])
  const bankNetMovement = Number(bankCredits._sum.amount ?? 0) - Number(bankDebits._sum.amount ?? 0)
  const startingBalance = interBalance - bankNetMovement

  // Convert bank transactions to invoice/expense format for calculateProjection
  const invoicesForCF: InvoiceForCashFlow[] = []
  const expensesForCF: ExpenseForCashFlow[] = []

  for (const tx of transactions) {
    const txDate = tx.date
    const amount = Number(tx.amount)

    if (tx.type === "CREDIT") {
      // Check if linked to an invoice via reconciliation
      if (tx.reconciliationLinks.length > 0) {
        for (const link of tx.reconciliationLinks) {
          invoicesForCF.push({
            id: `bt-${tx.id}-inv-${link.invoice.id}`,
            totalAmount: Number(link.amount),
            dueDate: txDate,
            paidAt: txDate,
            status: "PAGO",
            patientName: link.invoice.patient?.name,
          })
        }
      } else {
        // Unlinked credit — not reconciled to any invoice
        invoicesForCF.push({
          id: `bt-${tx.id}`,
          totalAmount: amount,
          dueDate: txDate,
          paidAt: txDate,
          status: "PAGO",
          patientName: `⚠ Não conciliado: ${tx.description}`,
        })
      }
    } else {
      // DEBIT
      if (tx.expenseReconciliationLinks.length > 0) {
        for (const link of tx.expenseReconciliationLinks) {
          expensesForCF.push({
            id: `bt-${tx.id}-exp-${link.expense.id}`,
            description: link.expense.description,
            amount: Number(link.amount),
            dueDate: txDate,
            paidAt: txDate,
            status: "PAID",
          })
        }
      } else {
        // Unlinked debit — not reconciled to any expense
        expensesForCF.push({
          id: `bt-${tx.id}`,
          description: `⚠ Não conciliado: ${tx.description}`,
          amount,
          dueDate: txDate,
          paidAt: txDate,
          status: "PAID",
        })
      }
    }
  }

  return { invoicesForCF, expensesForCF, startingBalance, balanceSource: "inter" }
}

/**
 * Fallback: build cash flow from invoices/expenses when no bank integration.
 */
async function buildFromInvoicesExpenses({
  clinicId,
  startDate,
  endDate,
}: {
  clinicId: string
  startDate: Date
  endDate: Date
}): Promise<BuildRealizedResult> {
  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { clinicId, status: "PAGO", paidAt: { gte: startDate, lte: endDate } },
      select: { id: true, totalAmount: true, dueDate: true, paidAt: true, status: true, patient: { select: { name: true } } },
    }),
    prisma.expense.findMany({
      where: { clinicId, status: "PAID", paidAt: { gte: startDate, lte: endDate } },
      select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true },
    }),
  ])

  const [pi, pe] = await Promise.all([
    prisma.invoice.aggregate({ where: { clinicId, status: "PAGO", paidAt: { lt: startDate } }, _sum: { totalAmount: true } }),
    prisma.expense.aggregate({ where: { clinicId, status: "PAID", paidAt: { lt: startDate } }, _sum: { amount: true } }),
  ])
  const startingBalance = Number(pi._sum.totalAmount ?? 0) - Number(pe._sum.amount ?? 0)

  const invoicesForCF: InvoiceForCashFlow[] = invoices.map((inv) => ({
    id: inv.id, totalAmount: Number(inv.totalAmount), dueDate: inv.dueDate ?? new Date(),
    paidAt: inv.paidAt, status: inv.status, patientName: inv.patient?.name,
  }))
  const expensesForCF: ExpenseForCashFlow[] = expenses.map((exp) => ({
    id: exp.id, description: exp.description, amount: Number(exp.amount),
    dueDate: exp.dueDate, paidAt: exp.paidAt, status: exp.status,
  }))

  return { invoicesForCF, expensesForCF, startingBalance, balanceSource: "computed" }
}
