import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  calculateProjection,
  detectAlerts,
  aggregateByWeek,
  aggregateByMonth,
  estimateTax,
  calculateCancellationRate,
  projectRevenue,
} from "@/lib/cashflow"
import { generateExpensesFromRecurrence } from "@/lib/expenses"
import type { InvoiceForCashFlow, ExpenseForCashFlow, RepasseForCashFlow, Granularity } from "@/lib/cashflow"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const startDateStr = url.searchParams.get("startDate")
    const endDateStr = url.searchParams.get("endDate")
    const granularity = (url.searchParams.get("granularity") ?? "daily") as Granularity
    const mode = url.searchParams.get("mode") ?? "realizado" // "realizado" or "projetado"

    const now = new Date()
    const startDate = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1)
    const endDate = endDateStr ? new Date(endDateStr) : new Date(now.getFullYear(), now.getMonth() + 3, 0)

    // Realizado: only confirmed/paid transactions (what actually happened)
    // Projetado: includes open invoices, open expenses, and recurring projections
    const isProjetado = mode === "projetado"

    // Parallel queries — fetch everything we need
    const [invoices, expenses, repassePayments, activeRecurrences, bankIntegration] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          ...(isProjetado
            ? {
                status: { in: ["PENDENTE", "ENVIADO", "PARCIAL", "PAGO"] },
                OR: [
                  { paidAt: { gte: startDate, lte: endDate } },
                  { dueDate: { gte: startDate, lte: endDate } },
                  { status: { in: ["PENDENTE", "ENVIADO"] }, dueDate: { lt: startDate } },
                ],
              }
            : {
                // Realizado: only PAGO invoices with paidAt in window
                status: "PAGO",
                paidAt: { gte: startDate, lte: endDate },
              }),
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
      prisma.expense.findMany({
        where: {
          clinicId: user.clinicId,
          ...(isProjetado
            ? {
                status: { in: ["OPEN", "OVERDUE", "PAID"] },
                OR: [
                  { paidAt: { gte: startDate, lte: endDate } },
                  { dueDate: { gte: startDate, lte: endDate } },
                ],
              }
            : {
                // Realizado: only PAID expenses with paidAt in window
                status: "PAID",
                paidAt: { gte: startDate, lte: endDate },
              }),
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
    // Use the Inter bank balance as the anchor (today's real balance), then work
    // backwards: startingBalance = interBalance - netFlow(startDate → today)
    // This avoids the "starting from zero" problem — the clinic had money before
    // the system existed, and not all transactions are tracked as expenses.
    let startingBalance = 0
    let balanceSource: "inter" | "computed" | "none" = "none"

    const interBalance = bankIntegration?.lastKnownBalance
      ? Number(bankIntegration.lastKnownBalance)
      : null

    if (interBalance !== null) {
      // Calculate net flow from startDate to today.
      // Includes tracked transactions (invoices, expenses, repasse) PLUS
      // unmatched bank transactions (debits not registered as expenses,
      // credits not reconciled to invoices — e.g. refunds, transfers).
      const [flowIncome, flowExpenses, flowRepasse, unmatchedDebits, unmatchedCredits] = await Promise.all([
        prisma.invoice.aggregate({
          where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: startDate, lte: now } },
          _sum: { totalAmount: true },
        }),
        prisma.expense.aggregate({
          where: { clinicId: user.clinicId, status: "PAID", paidAt: { gte: startDate, lte: now } },
          _sum: { amount: true },
        }),
        prisma.repassePayment.aggregate({
          where: { clinicId: user.clinicId, paidAt: { gte: startDate, lte: now } },
          _sum: { repasseAmount: true },
        }),
        // Unmatched DEBIT bank transactions (real outflows not tracked as expenses)
        prisma.bankTransaction.aggregate({
          where: {
            clinicId: user.clinicId,
            type: "DEBIT",
            date: { gte: startDate, lte: now },
            expenseReconciliationLinks: { none: {} },
            dismissReason: null,
          },
          _sum: { amount: true },
        }),
        // Unmatched undismissed CREDIT bank transactions (real inflows not tracked as invoices)
        prisma.bankTransaction.aggregate({
          where: {
            clinicId: user.clinicId,
            type: "CREDIT",
            date: { gte: startDate, lte: now },
            reconciliationLinks: { none: {} },
            dismissReason: null,
          },
          _sum: { amount: true },
        }),
      ])

      const trackedNetFlow =
        Number(flowIncome._sum.totalAmount ?? 0) -
        Number(flowExpenses._sum.amount ?? 0) -
        Number(flowRepasse._sum.repasseAmount ?? 0)

      // Add unmatched bank transactions to get the real net flow
      const bankOnlyNetFlow =
        Number(unmatchedCredits._sum.amount ?? 0) -
        Number(unmatchedDebits._sum.amount ?? 0)

      const totalNetFlow = trackedNetFlow + bankOnlyNetFlow

      // interBalance = startingBalance + totalNetFlow
      // → startingBalance = interBalance - totalNetFlow
      startingBalance = interBalance - totalNetFlow
      balanceSource = "inter"
    } else {
      // No Inter balance — fall back to cumulative from system start
      const [priorIncome, priorExpenses, priorRepasse] = await Promise.all([
        prisma.invoice.aggregate({
          where: { clinicId: user.clinicId, status: "PAGO", paidAt: { lt: startDate } },
          _sum: { totalAmount: true },
        }),
        prisma.expense.aggregate({
          where: { clinicId: user.clinicId, status: "PAID", paidAt: { lt: startDate } },
          _sum: { amount: true },
        }),
        prisma.repassePayment.aggregate({
          where: { clinicId: user.clinicId, paidAt: { lt: startDate } },
          _sum: { repasseAmount: true },
        }),
      ])
      startingBalance =
        Number(priorIncome._sum.totalAmount ?? 0) -
        Number(priorExpenses._sum.amount ?? 0) -
        Number(priorRepasse._sum.repasseAmount ?? 0)
      balanceSource = "computed"
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
    for (const rec of isProjetado ? activeRecurrences : []) {
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

    // Build mutable arrays for cash flow entries
    const invoicesForCashFlow: InvoiceForCashFlow[] = invoices.map((inv) => {
      const totalAmount = Number(inv.totalAmount)
      const reconciledAmount = inv.reconciliationLinks?.reduce(
        (sum, l) => sum + Number(l.amount), 0
      ) ?? 0
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

    const round2 = (n: number) => Math.round(n * 100) / 100

    // For projetado: project revenue from scheduled appointments + tax + repasse
    let revenueProjectionData = null
    let taxEstimateData = null

    if (isProjetado) {
      // Fetch scheduled appointments in window, patient fees, professionals, cancellation history
      const [scheduledAppointments, patients, profProfiles, historicalApts, clinic, nfseConfig] = await Promise.all([
        prisma.appointment.findMany({
          where: {
            clinicId: user.clinicId,
            scheduledAt: { gte: startDate, lte: endDate },
            type: { in: ["CONSULTA", "REUNIAO"] },
            status: { in: ["AGENDADO", "CONFIRMADO"] },
          },
          select: {
            id: true, scheduledAt: true, price: true, type: true, status: true,
            patientId: true, professionalProfileId: true, attendingProfessionalId: true,
            groupId: true, sessionGroupId: true,
          },
        }),
        prisma.patient.findMany({
          where: { clinicId: user.clinicId, sessionFee: { not: null } },
          select: { id: true, sessionFee: true },
        }),
        prisma.professionalProfile.findMany({
          where: { user: { clinicId: user.clinicId } },
          select: { id: true, repassePercentage: true },
        }),
        // Last 6 months of appointments for cancellation rate
        prisma.appointment.findMany({
          where: {
            clinicId: user.clinicId,
            type: "CONSULTA",
            scheduledAt: { gte: new Date(now.getFullYear(), now.getMonth() - 6, 1), lt: now },
          },
          select: { status: true, type: true },
        }),
        prisma.clinic.findUnique({
          where: { id: user.clinicId },
          select: { taxPercentage: true },
        }),
        prisma.nfseConfig.findFirst({
          where: { clinicId: user.clinicId },
          select: { regimeTributario: true, aliquotaIss: true },
        }),
      ])

      const patientFeeMap = new Map(patients.map((p) => [p.id, Number(p.sessionFee)]))
      const profMap = new Map(profProfiles.map((p) => [p.id, { id: p.id, repassePercentage: Number(p.repassePercentage) }]))
      const cancellationRate = calculateCancellationRate(historicalApts)
      const clinicTaxPct = Number(clinic?.taxPercentage ?? 0)

      const revProjection = projectRevenue(
        scheduledAppointments.map((a) => ({
          ...a,
          price: a.price ? Number(a.price) : null,
        })),
        patientFeeMap,
        profMap,
        cancellationRate,
        clinicTaxPct
      )

      revenueProjectionData = revProjection

      // Add projected appointment revenue as inflows (spread across the month by appointment date)
      for (const apt of scheduledAppointments) {
        const fee = apt.price ? Number(apt.price) : (apt.patientId ? patientFeeMap.get(apt.patientId) ?? 0 : 0)
        const adjustedFee = round2(fee * (1 - cancellationRate))
        if (adjustedFee > 0) {
          invoicesForCashFlow.push({
            id: `projected-apt-${apt.id}`,
            totalAmount: adjustedFee,
            dueDate: apt.scheduledAt,
            paidAt: null,
            status: "PROJECTED",
            patientName: "Sessão projetada",
          })
        }
      }

      // Estimate tax
      // Get RBT12 for Simples Nacional
      const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1)
      const rbt12Result = await prisma.invoice.aggregate({
        where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: twelveMonthsAgo, lt: now } },
        _sum: { totalAmount: true },
      })
      const rbt12 = Number(rbt12Result._sum.totalAmount ?? 0)

      const regime = nfseConfig?.regimeTributario ?? "3"
      const issRate = nfseConfig?.aliquotaIss ? Number(nfseConfig.aliquotaIss) / 100 : 0.05

      taxEstimateData = estimateTax(regime, revProjection.projectedRevenue, rbt12, issRate)

      // Add tax as an outflow (on the 20th of the month, typical DAS/DARF due date)
      if (taxEstimateData.totalTax > 0) {
        const taxDate = new Date(startDate.getFullYear(), startDate.getMonth(), 20)
        if (taxDate >= startDate && taxDate <= endDate) {
          expensesForCashFlow.push({
            id: "projected-tax",
            description: `Impostos estimados (${taxEstimateData.regime})`,
            amount: taxEstimateData.totalTax,
            dueDate: taxDate,
            paidAt: null,
            status: "PROJECTED",
          })
        }
      }

      // Add projected repasse as outflows (on the 15th, typical repasse date)
      for (const prof of revProjection.byProfessional) {
        if (prof.estimatedRepasse > 0) {
          const repasseDate = new Date(startDate.getFullYear(), startDate.getMonth(), 15)
          if (repasseDate >= startDate && repasseDate <= endDate) {
            expensesForCashFlow.push({
              id: `projected-repasse-${prof.professionalId}`,
              description: "Repasse profissional (projetado)",
              amount: prof.estimatedRepasse,
              dueDate: repasseDate,
              paidAt: null,
              status: "PROJECTED",
            })
          }
        }
      }
    }

    // Fetch unmatched bank transactions in the window to include in entries
    // These are real flows that aren't tracked as invoices/expenses (refunds, fees, transfers)
    const [unmatchedDebitTx, unmatchedCreditTx] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          clinicId: user.clinicId,
          type: "DEBIT",
          date: { gte: startDate, lte: endDate },
          expenseReconciliationLinks: { none: {} },
          dismissReason: null,
        },
        select: { id: true, date: true, amount: true, description: true },
      }),
      prisma.bankTransaction.findMany({
        where: {
          clinicId: user.clinicId,
          type: "CREDIT",
          date: { gte: startDate, lte: endDate },
          reconciliationLinks: { none: {} },
          dismissReason: null,
        },
        select: { id: true, date: true, amount: true, description: true },
      }),
    ])

    // Add unmatched credit bank transactions as additional inflows
    for (const tx of unmatchedCreditTx) {
      invoicesForCashFlow.push({
        id: `bank-credit-${tx.id}`,
        totalAmount: Number(tx.amount),
        dueDate: tx.date,
        paidAt: tx.date,
        status: "PAGO",
        patientName: `${tx.description} (banco)`,
      })
    }

    // Add unmatched debit bank transactions as additional outflows
    for (const tx of unmatchedDebitTx) {
      expensesForCashFlow.push({
        id: `bank-debit-${tx.id}`,
        description: `${tx.description} (banco)`,
        amount: Number(tx.amount),
        dueDate: tx.date,
        paidAt: tx.date,
        status: "PAID",
      })
    }

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
      lastKnownBalance: bankIntegration?.lastKnownBalance ? Number(bankIntegration.lastKnownBalance) : null,
      balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
      // Projection details (only in projetado mode)
      ...(isProjetado && revenueProjectionData && {
        revenueProjection: {
          totalAppointments: revenueProjectionData.totalAppointments,
          grossRevenue: revenueProjectionData.grossRevenue,
          cancellationRate: revenueProjectionData.cancellationRate,
          projectedRevenue: revenueProjectionData.projectedRevenue,
          totalEstimatedRepasse: revenueProjectionData.totalEstimatedRepasse,
        },
        taxEstimate: taxEstimateData,
      }),
    })
  }
)
