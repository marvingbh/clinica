import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  calculateProjection,
  detectAlerts,
  aggregateByWeek,
  aggregateByMonth,
} from "@/lib/cashflow"
import { generateExpensesFromRecurrence } from "@/lib/expenses"
import type { InvoiceForCashFlow, ExpenseForCashFlow, RepasseForCashFlow, Granularity } from "@/lib/cashflow"

export const GET = withFeatureAuth(
  { feature: "expenses", minAccess: "READ" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const startDateStr = url.searchParams.get("startDate")
    const endDateStr = url.searchParams.get("endDate")
    const granularity = (url.searchParams.get("granularity") ?? "daily") as Granularity
    const startingBalance = parseFloat(url.searchParams.get("startingBalance") ?? "0")

    const now = new Date()
    const startDate = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1)
    const endDate = endDateStr ? new Date(endDateStr) : new Date(now.getFullYear(), now.getMonth() + 3, 0)

    // Parallel queries
    const [invoices, expenses, repassePayments, activeRecurrences] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["PENDENTE", "ENVIADO", "PARCIAL", "PAGO"] },
          OR: [
            { dueDate: { gte: startDate, lte: endDate } },
            { paidAt: { gte: startDate, lte: endDate } },
          ],
        },
        select: {
          id: true,
          totalAmount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          patient: { select: { name: true } },
        },
      }),
      prisma.expense.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["OPEN", "OVERDUE", "PAID"] },
          OR: [
            { dueDate: { gte: startDate, lte: endDate } },
            { paidAt: { gte: startDate, lte: endDate } },
          ],
        },
        select: {
          id: true,
          description: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          recurrenceId: true,
        },
      }),
      prisma.repassePayment.findMany({
        where: {
          clinicId: user.clinicId,
          OR: [
            {
              referenceYear: { gte: startDate.getFullYear(), lte: endDate.getFullYear() },
            },
          ],
        },
        select: {
          id: true,
          repasseAmount: true,
          referenceMonth: true,
          referenceYear: true,
          paidAt: true,
          professionalProfile: { select: { user: { select: { name: true } } } },
        },
      }),
      prisma.expenseRecurrence.findMany({
        where: { clinicId: user.clinicId, active: true },
      }),
    ])

    // Generate projected expenses from active recurrences that don't yet have
    // materialized expenses in the window. This fills gaps beyond the cron's
    // 3-month generation horizon.
    const existingRecurrenceExpenseDates = new Set(
      expenses
        .filter((e) => e.recurrenceId)
        .map((e) => `${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`)
    )

    const projectedFromRecurrences: ExpenseForCashFlow[] = []
    for (const rec of activeRecurrences) {
      const generated = generateExpensesFromRecurrence(
        { ...rec, amount: Number(rec.amount) },
        endDate
      )
      for (const g of generated) {
        const key = `${rec.id}-${g.dueDate.toISOString().split("T")[0]}`
        if (!existingRecurrenceExpenseDates.has(key)) {
          projectedFromRecurrences.push({
            id: `projected-${rec.id}-${g.dueDate.toISOString().split("T")[0]}`,
            description: `${g.description} (projetado)`,
            amount: g.amount,
            dueDate: g.dueDate,
            paidAt: null,
            status: "PROJECTED",
          })
        }
      }
    }

    const invoicesForCashFlow: InvoiceForCashFlow[] = invoices.map((inv) => ({
      id: inv.id,
      totalAmount: Number(inv.totalAmount),
      dueDate: inv.dueDate ?? new Date(),
      paidAt: inv.paidAt,
      status: inv.status,
      patientName: inv.patient?.name,
    }))

    const expensesForCashFlow: ExpenseForCashFlow[] = [
      ...expenses.map((exp) => ({
        id: exp.id,
        description: exp.description,
        amount: Number(exp.amount),
        dueDate: exp.dueDate,
        paidAt: exp.paidAt,
        status: exp.status,
      })),
      ...projectedFromRecurrences,
    ]

    const repasseForCashFlow: RepasseForCashFlow[] = repassePayments.map((rep) => ({
      id: rep.id,
      repasseAmount: Number(rep.repasseAmount),
      referenceMonth: rep.referenceMonth,
      referenceYear: rep.referenceYear,
      paidAt: rep.paidAt,
      professionalName: rep.professionalProfile?.user?.name ?? "Profissional",
    }))

    const projection = calculateProjection(
      invoicesForCashFlow,
      expensesForCashFlow,
      repasseForCashFlow,
      startDate,
      endDate,
      startingBalance
    )

    const alerts = detectAlerts(projection)

    // Apply granularity
    let entries = projection.entries
    if (granularity === "weekly") entries = aggregateByWeek(entries)
    if (granularity === "monthly") entries = aggregateByMonth(entries)

    return NextResponse.json({
      entries,
      alerts,
      summary: projection.summary,
    })
  }
)
