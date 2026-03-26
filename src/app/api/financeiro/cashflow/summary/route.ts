import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0)

    const [thisMonthInvoices, thisMonthExpenses, nextMonthExpenses, overdueExpenses] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          clinicId: user.clinicId,
          status: "PAGO",
          paidAt: { gte: thisMonthStart, lte: thisMonthEnd },
        },
        _sum: { totalAmount: true },
      }),
      prisma.expense.aggregate({
        where: {
          clinicId: user.clinicId,
          status: "PAID",
          paidAt: { gte: thisMonthStart, lte: thisMonthEnd },
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          clinicId: user.clinicId,
          status: { in: ["OPEN", "OVERDUE"] },
          dueDate: { gte: nextMonthStart, lte: nextMonthEnd },
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          clinicId: user.clinicId,
          status: "OVERDUE",
        },
        _sum: { amount: true },
        _count: true,
      }),
    ])

    return NextResponse.json({
      thisMonth: {
        inflow: Number(thisMonthInvoices._sum.totalAmount ?? 0),
        outflow: Number(thisMonthExpenses._sum.amount ?? 0),
        net: Number(thisMonthInvoices._sum.totalAmount ?? 0) - Number(thisMonthExpenses._sum.amount ?? 0),
      },
      nextMonth: {
        projectedOutflow: Number(nextMonthExpenses._sum.amount ?? 0),
      },
      overdue: {
        total: Number(overdueExpenses._sum.amount ?? 0),
        count: overdueExpenses._count,
      },
    })
  }
)
