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
    const mode = url.searchParams.get("mode") ?? "realizado"

    const now = new Date()
    const startDate = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1)
    const endDate = endDateStr ? new Date(endDateStr) : new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const isProjetado = mode === "projetado"

    // Today boundary for splitting actual vs projected
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const todayStr = today.toISOString().split("T")[0]

    // Does this window have past/future relative to today?
    const hasPast = startDate <= today
    const hasFuture = endDate >= tomorrow

    // ========================================================================
    // QUERIES: Split at today boundary for projetado mode
    // ========================================================================

    // --- INVOICES ---
    const invoiceQueries = []

    if (isProjetado) {
      // Past half: paid invoices + overdue unpaid invoices
      if (hasPast) {
        invoiceQueries.push(
          prisma.invoice.findMany({
            where: {
              clinicId: user.clinicId,
              OR: [
                { status: "PAGO", paidAt: { gte: startDate, lte: today } },
                { status: { in: ["PENDENTE", "ENVIADO"] }, dueDate: { gte: startDate, lt: tomorrow } },
              ],
            },
            select: { id: true, totalAmount: true, dueDate: true, paidAt: true, status: true, patient: { select: { name: true } }, reconciliationLinks: { select: { amount: true } } },
          })
        )
      }
      // Future half: unpaid invoices due after today
      if (hasFuture) {
        invoiceQueries.push(
          prisma.invoice.findMany({
            where: {
              clinicId: user.clinicId,
              status: { in: ["PENDENTE", "ENVIADO", "PARCIAL"] },
              dueDate: { gte: tomorrow, lte: endDate },
            },
            select: { id: true, totalAmount: true, dueDate: true, paidAt: true, status: true, patient: { select: { name: true } }, reconciliationLinks: { select: { amount: true } } },
          })
        )
      }
    } else {
      // Realizado: only paid
      invoiceQueries.push(
        prisma.invoice.findMany({
          where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: startDate, lte: endDate } },
          select: { id: true, totalAmount: true, dueDate: true, paidAt: true, status: true, patient: { select: { name: true } }, reconciliationLinks: { select: { amount: true } } },
        })
      )
    }

    // --- EXPENSES ---
    const expenseQueries = []

    if (isProjetado) {
      // Past half: paid expenses + overdue unpaid expenses
      if (hasPast) {
        expenseQueries.push(
          prisma.expense.findMany({
            where: {
              clinicId: user.clinicId,
              OR: [
                { status: "PAID", paidAt: { gte: startDate, lte: today } },
                { status: { in: ["OPEN", "OVERDUE"] }, dueDate: { gte: startDate, lt: tomorrow } },
              ],
            },
            select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true, recurrenceId: true },
          })
        )
      }
      // Future half: open/overdue expenses due after today
      if (hasFuture) {
        expenseQueries.push(
          prisma.expense.findMany({
            where: {
              clinicId: user.clinicId,
              status: { in: ["OPEN", "OVERDUE"] },
              dueDate: { gte: tomorrow, lte: endDate },
            },
            select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true, recurrenceId: true },
          })
        )
      }
    } else {
      // Realizado: only paid
      expenseQueries.push(
        prisma.expense.findMany({
          where: { clinicId: user.clinicId, status: "PAID", paidAt: { gte: startDate, lte: endDate } },
          select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true, recurrenceId: true },
        })
      )
    }

    // Run all queries in parallel
    const [invoiceResults, expenseResults, repassePayments, activeRecurrences, bankIntegration] = await Promise.all([
      Promise.all(invoiceQueries).then((results) => results.flat()),
      Promise.all(expenseQueries).then((results) => results.flat()),
      prisma.repassePayment.findMany({
        where: {
          clinicId: user.clinicId,
          ...(isProjetado ? {} : { paidAt: { gte: startDate, lte: endDate } }),
          ...(isProjetado ? {
            OR: [
              { paidAt: { gte: startDate, lte: today } },
              { referenceYear: startDate.getFullYear(), referenceMonth: { gte: startDate.getMonth() + 1, lte: endDate.getMonth() + 1 } },
            ],
          } : {}),
        },
        select: { id: true, repasseAmount: true, referenceMonth: true, referenceYear: true, paidAt: true, professionalProfile: { select: { user: { select: { name: true } } } } },
      }),
      isProjetado ? prisma.expenseRecurrence.findMany({ where: { clinicId: user.clinicId, active: true } }) : Promise.resolve([]),
      prisma.bankIntegration.findFirst({
        where: { clinicId: user.clinicId, isActive: true },
        select: { lastKnownBalance: true, balanceFetchedAt: true },
      }),
    ])

    // ========================================================================
    // STARTING BALANCE: Anchor from Inter balance
    // ========================================================================
    let startingBalance = 0
    let balanceSource: "inter" | "computed" | "none" = "none"
    const interBalance = bankIntegration?.lastKnownBalance ? Number(bankIntegration.lastKnownBalance) : null

    // Starting balance: only invoices (in) and expenses (out) — repasse is already
    // tracked as expenses when paid, bank transactions are noise
    if (interBalance !== null) {
      const [flowIncome, flowExpenses] = await Promise.all([
        prisma.invoice.aggregate({ where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: startDate, lte: now } }, _sum: { totalAmount: true } }),
        prisma.expense.aggregate({ where: { clinicId: user.clinicId, status: "PAID", paidAt: { gte: startDate, lte: now } }, _sum: { amount: true } }),
      ])
      const netFlow = Number(flowIncome._sum.totalAmount ?? 0) - Number(flowExpenses._sum.amount ?? 0)
      startingBalance = interBalance - netFlow
      balanceSource = "inter"
    } else {
      const [pi, pe] = await Promise.all([
        prisma.invoice.aggregate({ where: { clinicId: user.clinicId, status: "PAGO", paidAt: { lt: startDate } }, _sum: { totalAmount: true } }),
        prisma.expense.aggregate({ where: { clinicId: user.clinicId, status: "PAID", paidAt: { lt: startDate } }, _sum: { amount: true } }),
      ])
      startingBalance = Number(pi._sum.totalAmount ?? 0) - Number(pe._sum.amount ?? 0)
      balanceSource = "computed"
    }

    // ========================================================================
    // BUILD CASH FLOW ENTRIES
    // ========================================================================
    const invoicesForCashFlow: InvoiceForCashFlow[] = invoiceResults.map((inv) => {
      const total = Number(inv.totalAmount)
      const reconciled = inv.reconciliationLinks?.reduce((s, l) => s + Number(l.amount), 0) ?? 0
      return {
        id: inv.id,
        totalAmount: inv.status === "PARCIAL" ? total - reconciled : total,
        dueDate: inv.dueDate ?? new Date(),
        paidAt: inv.paidAt,
        status: inv.status,
        patientName: inv.patient?.name,
      }
    })

    const expensesForCashFlow: ExpenseForCashFlow[] = expenseResults.map((exp) => ({
      id: exp.id,
      description: exp.description,
      amount: Number(exp.amount),
      dueDate: exp.dueDate,
      paidAt: exp.paidAt,
      status: exp.status,
    }))

    // ========================================================================
    // RECURRENCE PROJECTIONS: Only for future dates, with proper dedup
    // ========================================================================
    if (isProjetado && hasFuture && activeRecurrences.length > 0) {
      // Query ALL materialized expenses for these recurrences (not just in-window)
      const allRecExpenses = await prisma.expense.findMany({
        where: { clinicId: user.clinicId, recurrenceId: { in: activeRecurrences.map((r) => r.id) } },
        select: { recurrenceId: true, dueDate: true },
      })
      const existingDates = new Set(allRecExpenses.map((e) => `${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`))

      for (const rec of activeRecurrences) {
        // Generate only from today onwards
        const generated = generateExpensesFromRecurrence({ ...rec, amount: Number(rec.amount), lastGeneratedDate: today }, endDate)
        for (const g of generated) {
          if (g.dueDate <= today) continue
          const key = `${rec.id}-${g.dueDate.toISOString().split("T")[0]}`
          if (!existingDates.has(key)) {
            expensesForCashFlow.push({
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
    }

    // ========================================================================
    // APPOINTMENT REVENUE PROJECTION: Only for future appointments
    // ========================================================================
    const round2 = (n: number) => Math.round(n * 100) / 100
    let revenueProjectionData = null
    let taxEstimateData = null
    let actualRevenue = 0

    if (isProjetado && hasFuture) {
      const [futureAppointments, patients, profProfiles, historicalApts, clinic, nfseConfig] = await Promise.all([
        prisma.appointment.findMany({
          where: {
            clinicId: user.clinicId,
            scheduledAt: { gte: tomorrow, lte: endDate }, // ONLY future appointments
            type: { in: ["CONSULTA", "REUNIAO"] },
            status: { in: ["AGENDADO", "CONFIRMADO"] },
          },
          select: { id: true, scheduledAt: true, price: true, type: true, status: true, patientId: true, professionalProfileId: true, attendingProfessionalId: true, groupId: true, sessionGroupId: true },
        }),
        prisma.patient.findMany({ where: { clinicId: user.clinicId, sessionFee: { not: null } }, select: { id: true, sessionFee: true } }),
        prisma.professionalProfile.findMany({ where: { user: { clinicId: user.clinicId } }, select: { id: true, repassePercentage: true } }),
        prisma.appointment.findMany({ where: { clinicId: user.clinicId, type: "CONSULTA", scheduledAt: { gte: new Date(now.getFullYear(), now.getMonth() - 6, 1), lt: now } }, select: { status: true, type: true } }),
        prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { taxPercentage: true } }),
        prisma.nfseConfig.findFirst({ where: { clinicId: user.clinicId }, select: { regimeTributario: true, aliquotaIss: true } }),
      ])

      const patientFeeMap = new Map(patients.map((p) => [p.id, Number(p.sessionFee)]))
      const profMap = new Map(profProfiles.map((p) => [p.id, { id: p.id, repassePercentage: Number(p.repassePercentage) }]))
      const cancellationRate = calculateCancellationRate(historicalApts)
      const clinicTaxPct = Number(clinic?.taxPercentage ?? 0)

      const revProjection = projectRevenue(
        futureAppointments.map((a) => ({ ...a, price: a.price ? Number(a.price) : null })),
        patientFeeMap, profMap, cancellationRate, clinicTaxPct
      )
      revenueProjectionData = revProjection

      // Add projected appointment revenue as inflows on their scheduled dates
      for (const apt of futureAppointments) {
        const fee = apt.price ? Number(apt.price) : (apt.patientId ? patientFeeMap.get(apt.patientId) ?? 0 : 0)
        const adjusted = round2(fee * (1 - cancellationRate))
        if (adjusted > 0) {
          invoicesForCashFlow.push({
            id: `projected-apt-${apt.id}`,
            totalAmount: adjusted,
            dueDate: apt.scheduledAt,
            paidAt: null,
            status: "PROJECTED",
            patientName: "Sessão projetada",
          })
        }
      }

      // Actual revenue already received this month (for tax/repasse estimates)
      actualRevenue = invoiceResults.filter((i) => i.status === "PAGO").reduce((s, i) => s + Number(i.totalAmount), 0)
      const totalMonthRevenue = actualRevenue + revProjection.projectedRevenue

      // Tax estimate on total month revenue, subtract already-paid tax
      const rbt12 = Number((await prisma.invoice.aggregate({
        where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1), lt: now } },
        _sum: { totalAmount: true },
      }))._sum.totalAmount ?? 0)

      const regime = nfseConfig?.regimeTributario ?? "3"
      const issRate = nfseConfig?.aliquotaIss ? Number(nfseConfig.aliquotaIss) / 100 : 0.05
      taxEstimateData = estimateTax(regime, totalMonthRevenue, rbt12, issRate)

      // Only add remaining tax/repasse as projected outflows (subtract already paid)
      const taxAlreadyPaid = expenseResults.filter((e) => e.status === "PAID" && (e.description.toLowerCase().includes("imposto") || e.description.toLowerCase().includes("das"))).reduce((s, e) => s + Number(e.amount), 0)
      const remainingTax = Math.max(0, taxEstimateData.totalTax - taxAlreadyPaid)

      if (remainingTax > 0) {
        const taxDate = new Date(startDate.getFullYear(), startDate.getMonth(), 20)
        if (taxDate > today && taxDate <= endDate) {
          expensesForCashFlow.push({ id: "projected-tax", description: `Impostos estimados (${taxEstimateData.regime})`, amount: remainingTax, dueDate: taxDate, paidAt: null, status: "PROJECTED" })
        }
      }

      // Remaining repasse estimate
      const repasseAlreadyPaid = repassePayments.filter((r) => r.paidAt && r.paidAt <= today).reduce((s, r) => s + Number(r.repasseAmount), 0)
      const totalEstRepasse = revProjection.totalEstimatedRepasse
      const remainingRepasse = Math.max(0, totalEstRepasse - repasseAlreadyPaid)

      if (remainingRepasse > 0) {
        const repasseDate = new Date(startDate.getFullYear(), startDate.getMonth(), 15)
        const effectiveDate = repasseDate > today ? repasseDate : new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
        if (effectiveDate <= endDate) {
          expensesForCashFlow.push({ id: "projected-repasse", description: "Repasse profissional (projetado)", amount: remainingRepasse, dueDate: effectiveDate, paidAt: null, status: "PROJECTED" })
        }
      }
    }

    // Repasse is already tracked as expenses when paid — don't add separately
    const repasseForCashFlow: RepasseForCashFlow[] = []

    // ========================================================================
    // CALCULATE PROJECTION
    // ========================================================================
    const projection = calculateProjection(
      invoicesForCashFlow, expensesForCashFlow, repasseForCashFlow,
      startDate, endDate, startingBalance,
      isProjetado ? todayStr : undefined
    )

    const alerts = detectAlerts(projection)
    let entries = projection.entries
    if (granularity === "weekly") entries = aggregateByWeek(entries)
    if (granularity === "monthly") entries = aggregateByMonth(entries)

    return NextResponse.json({
      entries,
      alerts,
      summary: projection.summary,
      balanceSource,
      lastKnownBalance: interBalance,
      balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
      todayDivider: todayStr,
      ...(isProjetado && revenueProjectionData && {
        revenueProjection: {
          totalAppointments: revenueProjectionData.totalAppointments,
          grossRevenue: revenueProjectionData.grossRevenue,
          cancellationRate: revenueProjectionData.cancellationRate,
          projectedRevenue: revenueProjectionData.projectedRevenue,
          totalEstimatedRepasse: revenueProjectionData.totalEstimatedRepasse,
          actualRevenue,
        },
        taxEstimate: taxEstimateData,
        projectedExpenses: expensesForCashFlow
          .filter((e) => !e.id.startsWith("projected-tax") && !e.id.startsWith("projected-repasse"))
          .filter((e) => !e.paidAt) // Only future/unpaid expenses
          .reduce((sum, e) => sum + e.amount, 0),
      }),
    })
  }
)
