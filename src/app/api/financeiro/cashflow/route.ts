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
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split("T")[0]

    // Bank integration for balance display
    const bankIntegration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
      select: { lastKnownBalance: true, balanceFetchedAt: true },
    })
    const interBalance = bankIntegration?.lastKnownBalance ? Number(bankIntegration.lastKnownBalance) : null

    if (!isProjetado) {
      // ==================================================================
      // REALIZADO: Simple. Paid invoices in, paid expenses out.
      // ==================================================================
      const [invoices, expenses] = await Promise.all([
        prisma.invoice.findMany({
          where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: startDate, lte: endDate } },
          select: { id: true, totalAmount: true, dueDate: true, paidAt: true, status: true, patient: { select: { name: true } } },
        }),
        prisma.expense.findMany({
          where: { clinicId: user.clinicId, status: "PAID", paidAt: { gte: startDate, lte: endDate } },
          select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true },
        }),
      ])

      // Starting balance from Inter anchor
      let startingBalance = 0
      let balanceSource: "inter" | "computed" | "none" = "none"
      if (interBalance !== null) {
        const [fi, fe] = await Promise.all([
          prisma.invoice.aggregate({ where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: startDate, lte: now } }, _sum: { totalAmount: true } }),
          prisma.expense.aggregate({ where: { clinicId: user.clinicId, status: "PAID", paidAt: { gte: startDate, lte: now } }, _sum: { amount: true } }),
        ])
        startingBalance = interBalance - (Number(fi._sum.totalAmount ?? 0) - Number(fe._sum.amount ?? 0))
        balanceSource = "inter"
      } else {
        const [pi, pe] = await Promise.all([
          prisma.invoice.aggregate({ where: { clinicId: user.clinicId, status: "PAGO", paidAt: { lt: startDate } }, _sum: { totalAmount: true } }),
          prisma.expense.aggregate({ where: { clinicId: user.clinicId, status: "PAID", paidAt: { lt: startDate } }, _sum: { amount: true } }),
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

      const projection = calculateProjection(invoicesForCF, expensesForCF, [], startDate, endDate, startingBalance)
      const alerts = detectAlerts(projection)
      let entries = projection.entries
      if (granularity === "weekly") entries = aggregateByWeek(entries)
      if (granularity === "monthly") entries = aggregateByMonth(entries)

      return NextResponse.json({
        entries, alerts, summary: projection.summary, balanceSource, todayDivider: todayStr,
        lastKnownBalance: interBalance, balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
      })
    }

    // ==================================================================
    // PROJETADO: Pure projection from agenda + recurring expenses.
    // "What should this month look like?"
    // ==================================================================
    const [
      scheduledAppointments, patients, profProfiles, historicalApts,
      clinic, nfseConfig, activeRecurrences, openExpenses, paidRepasseIds,
    ] = await Promise.all([
      // All appointments in the month (AGENDADO/CONFIRMADO)
      prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          scheduledAt: { gte: startDate, lte: endDate },
          type: { in: ["CONSULTA", "REUNIAO"] },
          status: { in: ["AGENDADO", "CONFIRMADO", "FINALIZADO"] },
        },
        select: { id: true, scheduledAt: true, price: true, type: true, status: true, patientId: true, professionalProfileId: true, attendingProfessionalId: true, groupId: true, sessionGroupId: true },
      }),
      prisma.patient.findMany({ where: { clinicId: user.clinicId, sessionFee: { not: null } }, select: { id: true, sessionFee: true } }),
      prisma.professionalProfile.findMany({ where: { user: { clinicId: user.clinicId } }, select: { id: true, repassePercentage: true } }),
      // Last 6 months for cancellation rate
      prisma.appointment.findMany({
        where: { clinicId: user.clinicId, type: "CONSULTA", scheduledAt: { gte: new Date(now.getFullYear(), now.getMonth() - 6, 1), lt: now } },
        select: { status: true, type: true },
      }),
      prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { taxPercentage: true } }),
      prisma.nfseConfig.findFirst({ where: { clinicId: user.clinicId }, select: { regimeTributario: true, aliquotaIss: true } }),
      prisma.expenseRecurrence.findMany({ where: { clinicId: user.clinicId, active: true } }),
      // Open/overdue expenses already registered for this month
      prisma.expense.findMany({
        where: { clinicId: user.clinicId, status: { in: ["OPEN", "OVERDUE"] }, dueDate: { gte: startDate, lte: endDate } },
        select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true, recurrenceId: true },
      }),
      // Which professionals already got paid for this month
      prisma.repassePayment.findMany({
        where: { clinicId: user.clinicId, referenceMonth: startDate.getMonth() + 1, referenceYear: startDate.getFullYear() },
        select: { professionalProfileId: true },
      }),
    ])

    const patientFeeMap = new Map(patients.map((p) => [p.id, Number(p.sessionFee)]))
    const profMap = new Map(profProfiles.map((p) => [p.id, { id: p.id, repassePercentage: Number(p.repassePercentage) }]))
    const cancellationRate = calculateCancellationRate(historicalApts)
    const clinicTaxPct = Number(clinic?.taxPercentage ?? 0)
    const round2 = (n: number) => Math.round(n * 100) / 100

    // --- REVENUE: appointments × session fee × (1 - cancellation rate) ---
    const revProjection = projectRevenue(
      scheduledAppointments.map((a) => ({ ...a, price: a.price ? Number(a.price) : null })),
      patientFeeMap, profMap, cancellationRate, clinicTaxPct
    )

    const invoicesForCF: InvoiceForCashFlow[] = scheduledAppointments.map((apt) => {
      const fee = apt.price ? Number(apt.price) : (apt.patientId ? patientFeeMap.get(apt.patientId) ?? 0 : 0)
      const adjusted = round2(fee * (1 - cancellationRate))
      return {
        id: `apt-${apt.id}`,
        totalAmount: adjusted,
        dueDate: apt.scheduledAt,
        paidAt: null,
        status: "PROJECTED",
        patientName: "Sessão",
      }
    })

    // --- EXPENSES: open expenses + recurring projections (deduped) ---
    const expensesForCF: ExpenseForCashFlow[] = openExpenses.map((exp) => ({
      id: exp.id, description: exp.description, amount: Number(exp.amount),
      dueDate: exp.dueDate, paidAt: null, status: exp.status,
    }))

    // Add recurring projections not yet materialized
    const existingDates = new Set(openExpenses.filter((e) => e.recurrenceId).map((e) => `${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`))
    // Also check paid expenses for this month to avoid re-projecting
    const paidRecExpenses = await prisma.expense.findMany({
      where: { clinicId: user.clinicId, status: "PAID", recurrenceId: { not: null }, dueDate: { gte: startDate, lte: endDate } },
      select: { recurrenceId: true, dueDate: true },
    })
    for (const e of paidRecExpenses) {
      existingDates.add(`${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`)
    }

    for (const rec of activeRecurrences) {
      const generated = generateExpensesFromRecurrence({ ...rec, amount: Number(rec.amount), lastGeneratedDate: new Date(startDate.getTime() - 86400000) }, endDate)
      for (const g of generated) {
        if (g.dueDate < startDate || g.dueDate > endDate) continue
        const key = `${rec.id}-${g.dueDate.toISOString().split("T")[0]}`
        if (!existingDates.has(key)) {
          expensesForCF.push({
            id: `rec-${rec.id}-${g.dueDate.toISOString().split("T")[0]}`,
            description: `${g.description} (recorrente)`,
            amount: g.amount, dueDate: g.dueDate, paidAt: null, status: "PROJECTED",
          })
        }
      }
    }

    // --- TAX estimate ---
    const rbt12 = Number((await prisma.invoice.aggregate({
      where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1), lt: now } },
      _sum: { totalAmount: true },
    }))._sum.totalAmount ?? 0)
    const regime = nfseConfig?.regimeTributario ?? "3"
    const issRate = nfseConfig?.aliquotaIss ? Number(nfseConfig.aliquotaIss) / 100 : 0.05
    const taxEstimateData = estimateTax(regime, revProjection.projectedRevenue, rbt12, issRate)

    if (taxEstimateData.totalTax > 0) {
      const taxDate = new Date(startDate.getFullYear(), startDate.getMonth(), 20)
      if (taxDate >= startDate && taxDate <= endDate) {
        expensesForCF.push({ id: "projected-tax", description: `Impostos (${taxEstimateData.regime})`, amount: taxEstimateData.totalTax, dueDate: taxDate, paidAt: null, status: "PROJECTED" })
      }
    }

    // --- REPASSE estimate (only unpaid professionals) ---
    const paidProfIds = new Set(paidRepasseIds.map((r) => r.professionalProfileId))
    const unpaidRepasse = revProjection.byProfessional.filter((p) => !paidProfIds.has(p.professionalId))
    const totalUnpaidRepasse = unpaidRepasse.reduce((s, p) => s + p.estimatedRepasse, 0)

    for (const prof of unpaidRepasse) {
      if (prof.estimatedRepasse > 0) {
        expensesForCF.push({
          id: `repasse-${prof.professionalId}`,
          description: "Repasse profissional (estimado)",
          amount: prof.estimatedRepasse,
          dueDate: new Date(startDate.getFullYear(), startDate.getMonth(), 15),
          paidAt: null, status: "PROJECTED",
        })
      }
    }

    // --- BUILD PROJECTION (no starting balance — pure in/out for the month) ---
    const totalExpenses = expensesForCF.reduce((s, e) => s + e.amount, 0)
    const projection = calculateProjection(invoicesForCF, expensesForCF, [], startDate, endDate, 0, todayStr)
    let entries = projection.entries
    if (granularity === "weekly") entries = aggregateByWeek(entries)
    if (granularity === "monthly") entries = aggregateByMonth(entries)

    return NextResponse.json({
      entries,
      alerts: detectAlerts(projection),
      summary: projection.summary,
      balanceSource: "none",
      lastKnownBalance: interBalance,
      balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
      todayDivider: todayStr,
      revenueProjection: {
        totalAppointments: revProjection.totalAppointments,
        grossRevenue: revProjection.grossRevenue,
        cancellationRate: revProjection.cancellationRate,
        projectedRevenue: revProjection.projectedRevenue,
        totalEstimatedRepasse: totalUnpaidRepasse,
        actualRevenue: 0,
      },
      taxEstimate: taxEstimateData,
      projectedExpenses: totalExpenses - taxEstimateData.totalTax - totalUnpaidRepasse,
    })
  }
)
