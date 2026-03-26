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

    // Parse date strings as LOCAL dates (not UTC) to avoid timezone issues.
    // new Date("2026-04-01") creates UTC midnight which is March 31 in UTC-3.
    // Instead, split the string and use new Date(y, m-1, d) for local midnight.
    function parseLocalDate(str: string): Date {
      const [y, m, d] = str.split("-").map(Number)
      return new Date(y, m - 1, d)
    }

    const startDate = startDateStr ? parseLocalDate(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1)
    const endDate = endDateStr ? parseLocalDate(endDateStr) : new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const isProjetado = mode === "projetado"
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

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

    // Use local dates for recurrence generation to avoid UTC/local timezone mismatch
    const localStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const localEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    const dayBeforeStart = new Date(localStart)
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1)

    for (const rec of activeRecurrences) {
      const generated = generateExpensesFromRecurrence({ ...rec, amount: Number(rec.amount), lastGeneratedDate: dayBeforeStart }, localEnd)
      for (const g of generated) {
        if (g.dueDate < localStart || g.dueDate > localEnd) continue
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
    // Taxes are always on PREVIOUS period revenue:
    // - Monthly taxes due in April → based on March revenue
    // - Quarterly taxes due in April → based on Q1 (Jan-Mar) revenue
    const regime = nfseConfig?.regimeTributario ?? "3"
    const issRate = nfseConfig?.aliquotaIss ? Number(nfseConfig.aliquotaIss) / 100 : 0.05
    const projMonth = startDate.getMonth() + 1
    const projYear = startDate.getFullYear()

    // Previous month revenue (for monthly taxes)
    const prevMonthStart = new Date(projYear, projMonth - 2, 1) // month is 1-indexed, Date uses 0-indexed
    const prevMonthEnd = new Date(projYear, projMonth - 1, 0) // last day of prev month
    const prevMonthRevenue = Number((await prisma.invoice.aggregate({
      where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { totalAmount: true },
    }))._sum.totalAmount ?? 0) || revProjection.projectedRevenue // fallback to projection if no actual data

    // Previous quarter revenue (for quarterly taxes)
    // Q1 payment (Apr) → Jan-Mar, Q2 (Jul) → Apr-Jun, Q3 (Oct) → Jul-Sep, Q4 (Jan) → Oct-Dec
    const quarterMap: Record<number, [number, number]> = {
      4: [0, 2],   // Apr: Jan(0)-Mar(2)
      7: [3, 5],   // Jul: Apr(3)-Jun(5)
      10: [6, 8],  // Oct: Jul(6)-Sep(8)
      1: [9, 11],  // Jan: Oct(9)-Dec(11) of prev year
    }
    let prevQuarterRevenue: number | undefined
    if (quarterMap[projMonth]) {
      const [qStartMonth, qEndMonth] = quarterMap[projMonth]
      const qYear = projMonth === 1 ? projYear - 1 : projYear
      const qStart = new Date(qYear, qStartMonth, 1)
      const qEnd = new Date(qYear, qEndMonth + 1, 0) // last day
      prevQuarterRevenue = Number((await prisma.invoice.aggregate({
        where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: qStart, lte: qEnd } },
        _sum: { totalAmount: true },
      }))._sum.totalAmount ?? 0) || revProjection.projectedRevenue * 3 // fallback
    }

    // RBT12 for Simples Nacional
    const rbt12 = Number((await prisma.invoice.aggregate({
      where: { clinicId: user.clinicId, status: "PAGO", paidAt: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1), lt: now } },
      _sum: { totalAmount: true },
    }))._sum.totalAmount ?? 0)

    const taxEstimateData = estimateTax(regime, prevMonthRevenue, projMonth, prevQuarterRevenue, rbt12, issRate)

    // Add monthly taxes (PIS + COFINS + ISS) — always due
    if (taxEstimateData.monthlyTotal > 0) {
      const taxDate = new Date(startDate.getFullYear(), startDate.getMonth(), 20)
      if (taxDate >= startDate && taxDate <= endDate) {
        expensesForCF.push({ id: "projected-tax-monthly", description: `Impostos mensais (ISS + PIS + COFINS)`, amount: taxEstimateData.monthlyTotal, dueDate: taxDate, paidAt: null, status: "PROJECTED" })
      }
    }

    // Add quarterly taxes (IRPJ + CSLL) — only in quarter payment months
    if (taxEstimateData.quarterlyDueThisMonth && taxEstimateData.quarterlyTotal > 0) {
      const taxDate = new Date(startDate.getFullYear(), startDate.getMonth(), 20)
      if (taxDate >= startDate && taxDate <= endDate) {
        expensesForCF.push({ id: "projected-tax-quarterly", description: `IRPJ + CSLL (trimestral)`, amount: taxEstimateData.quarterlyTotal, dueDate: taxDate, paidAt: null, status: "PROJECTED" })
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
    // Calculate expenses total excluding tax and repasse (they're shown separately)
    const recurringAndOpenExpenses = expensesForCF.filter(
      (e) => !e.id.startsWith("projected-tax-") && !e.id.startsWith("repasse-")
    )
    const totalProjectedExpenses = recurringAndOpenExpenses.reduce((s, e) => s + e.amount, 0)
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
      projectedExpenses: totalProjectedExpenses,
    })
  }
)
