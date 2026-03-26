import { prisma } from "@/lib/prisma"
import type { InvoiceForCashFlow, ExpenseForCashFlow } from "./types"

interface BuildRealizedParams {
  clinicId: string
  startDate: Date
  endDate: Date
  interBalance: number | null
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
}: BuildRealizedParams): Promise<BuildRealizedResult> {
  const now = new Date()

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

  // Starting balance from Inter anchor
  let startingBalance = 0
  let balanceSource: "inter" | "computed" | "none" = "none"
  if (interBalance !== null) {
    const [fi, fe] = await Promise.all([
      prisma.invoice.aggregate({ where: { clinicId, status: "PAGO", paidAt: { gte: startDate, lte: now } }, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { clinicId, status: "PAID", paidAt: { gte: startDate, lte: now } }, _sum: { amount: true } }),
    ])
    startingBalance = interBalance - (Number(fi._sum.totalAmount ?? 0) - Number(fe._sum.amount ?? 0))
    balanceSource = "inter"
  } else {
    const [pi, pe] = await Promise.all([
      prisma.invoice.aggregate({ where: { clinicId, status: "PAGO", paidAt: { lt: startDate } }, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { clinicId, status: "PAID", paidAt: { lt: startDate } }, _sum: { amount: true } }),
    ])
    startingBalance = Number(pi._sum.totalAmount ?? 0) - Number(pe._sum.amount ?? 0)
    balanceSource = "computed"
  }

  const invoicesForCF: InvoiceForCashFlow[] = invoices.map((inv) => ({
    id: inv.id, totalAmount: Number(inv.totalAmount), dueDate: inv.dueDate ?? new Date(),
    paidAt: inv.paidAt, status: inv.status, patientName: inv.patient?.name,
  }))
  const expensesForCF: ExpenseForCashFlow[] = expenses.map((exp) => ({
    id: exp.id, description: exp.description, amount: Number(exp.amount),
    dueDate: exp.dueDate, paidAt: exp.paidAt, status: exp.status,
  }))

  return { invoicesForCF, expensesForCF, startingBalance, balanceSource }
}
