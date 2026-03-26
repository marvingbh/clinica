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
    const manualBalance = url.searchParams.get("startingBalance")

    const now = new Date()
    const startDate = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1)
    const endDate = endDateStr ? new Date(endDateStr) : new Date(now.getFullYear(), now.getMonth() + 3, 0)

    // Parallel queries — fetch everything we need
    const [invoices, expenses, repassePayments, activeRecurrences, bankIntegration] = await Promise.all([
      // Invoices: ALL non-cancelled within the window (past paid + future expected)
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["PENDENTE", "ENVIADO", "PARCIAL", "PAGO"] },
          OR: [
            // Paid within window
            { paidAt: { gte: startDate, lte: endDate } },
            // Due within window (future expected inflows)
            { dueDate: { gte: startDate, lte: endDate } },
            // Overdue invoices still pending (no dueDate filter, just status)
            { status: { in: ["PENDENTE", "ENVIADO"] }, dueDate: { lt: startDate } },
          ],
        },
        select: {
          id: true,
          totalAmount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          patient: { select: { name: true } },
          reconciliationLinks: { select: { amount: true } },
        },
      }),
      // Expenses: ALL non-cancelled within the window
      prisma.expense.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["OPEN", "OVERDUE", "PAID"] },
          OR: [
            { paidAt: { gte: startDate, lte: endDate } },
            { dueDate: { gte: startDate, lte: endDate } },
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
      // Repasse: within the year range
      prisma.repassePayment.findMany({
        where: {
          clinicId: user.clinicId,
          OR: [
            { paidAt: { gte: startDate, lte: endDate } },
            {
              referenceYear: { gte: startDate.getFullYear(), lte: endDate.getFullYear() },
              referenceMonth: { gte: 1, lte: 12 },
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
      // Active recurrences for projecting future expenses
      prisma.expenseRecurrence.findMany({
        where: { clinicId: user.clinicId, active: true },
      }),
      // Bank integration for balance
      prisma.bankIntegration.findFirst({
        where: { clinicId: user.clinicId, isActive: true },
        select: { lastKnownBalance: true, balanceFetchedAt: true },
      }),
    ])

    // Determine starting balance:
    // 1. Manual override if provided
    // 2. Last known bank balance from Inter
    // 3. Default to 0
    let startingBalance = 0
    let balanceSource: "manual" | "inter" | "none" = "none"
    if (manualBalance && !isNaN(parseFloat(manualBalance))) {
      startingBalance = parseFloat(manualBalance)
      balanceSource = "manual"
    } else if (bankIntegration?.lastKnownBalance) {
      startingBalance = Number(bankIntegration.lastKnownBalance)
      balanceSource = "inter"
    }

    // Project future expenses from active recurrences.
    // Use startDate (not lastGeneratedDate) to ensure we cover the full window,
    // then deduplicate against existing materialized expenses.
    const existingRecurrenceExpenseDates = new Set(
      expenses
        .filter((e) => e.recurrenceId)
        .map((e) => `${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`)
    )

    const projectedFromRecurrences: ExpenseForCashFlow[] = []
    for (const rec of activeRecurrences) {
      // For projection, generate from startDate to endDate (ignoring lastGeneratedDate)
      const projectionTemplate = {
        ...rec,
        amount: Number(rec.amount),
        lastGeneratedDate: null, // Force generation from startDate
      }
      const generated = generateExpensesFromRecurrence(projectionTemplate, endDate)
      for (const g of generated) {
        if (g.dueDate < startDate) continue
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

    // Build invoice cash flow entries
    // For PARCIAL invoices, use remaining amount (total - already reconciled)
    const invoicesForCashFlow: InvoiceForCashFlow[] = invoices.map((inv) => {
      const totalAmount = Number(inv.totalAmount)
      const reconciledAmount = inv.reconciliationLinks?.reduce(
        (sum, l) => sum + Number(l.amount), 0
      ) ?? 0

      // For PAGO, use full amount on paidAt date
      // For PARCIAL, use remaining on dueDate
      // For PENDENTE/ENVIADO, use full amount on dueDate
      const effectiveAmount = inv.status === "PARCIAL"
        ? totalAmount - reconciledAmount
        : totalAmount

      return {
        id: inv.id,
        totalAmount: effectiveAmount,
        dueDate: inv.dueDate ?? new Date(),
        paidAt: inv.paidAt,
        status: inv.status,
        patientName: inv.patient?.name,
      }
    })

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
      balanceSource,
      balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
    })
  }
)
