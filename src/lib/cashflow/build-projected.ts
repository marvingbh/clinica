import { prisma } from "@/lib/prisma"
import { generateExpensesFromRecurrence } from "@/lib/expenses"
import { calculateCancellationRate, projectRevenue, estimateTax } from "./index"
import type { InvoiceForCashFlow, ExpenseForCashFlow } from "./types"
import type { TaxEstimate } from "./tax-estimate"
import type { RevenueProjection } from "./revenue-projection"

interface BuildProjectedParams {
  clinicId: string
  startDate: Date
  endDate: Date
  localStartDate: Date
  localEndDate: Date
  selectedMonth: number
  selectedYear: number
}

interface BuildProjectedResult {
  invoicesForCF: InvoiceForCashFlow[]
  expensesForCF: ExpenseForCashFlow[]
  revenueProjectionData: RevenueProjection
  taxEstimateData: TaxEstimate
  totalProjectedExpenses: number
  totalUnpaidRepasse: number
}

export async function buildProjected({
  clinicId, startDate, endDate, localStartDate, localEndDate,
  selectedMonth, selectedYear,
}: BuildProjectedParams): Promise<BuildProjectedResult> {
  const now = new Date()

  const [
    scheduledAppointments, patients, profProfiles, historicalApts,
    clinic, nfseConfig, activeRecurrences, openExpenses, paidRepasseIds,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId,
        scheduledAt: { gte: startDate, lte: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
        status: { in: ["AGENDADO", "CONFIRMADO", "FINALIZADO"] },
      },
      select: { id: true, scheduledAt: true, price: true, type: true, status: true, patientId: true, professionalProfileId: true, attendingProfessionalId: true, groupId: true, sessionGroupId: true },
    }),
    prisma.patient.findMany({ where: { clinicId, sessionFee: { not: null } }, select: { id: true, sessionFee: true } }),
    prisma.professionalProfile.findMany({ where: { user: { clinicId } }, select: { id: true, repassePercentage: true } }),
    prisma.appointment.findMany({
      where: { clinicId, type: "CONSULTA", scheduledAt: { gte: new Date(now.getFullYear(), now.getMonth() - 6, 1), lt: now } },
      select: { status: true, type: true },
    }),
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { taxPercentage: true } }),
    prisma.nfseConfig.findFirst({ where: { clinicId }, select: { regimeTributario: true, aliquotaIss: true } }),
    prisma.expenseRecurrence.findMany({ where: { clinicId, active: true } }),
    prisma.expense.findMany({
      where: { clinicId, status: { in: ["OPEN", "OVERDUE"] }, dueDate: { gte: startDate, lte: endDate } },
      select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true, recurrenceId: true },
    }),
    prisma.repassePayment.findMany({
      where: { clinicId, referenceMonth: selectedMonth, referenceYear: selectedYear },
      select: { professionalProfileId: true },
    }),
  ])

  const patientFeeMap = new Map(patients.map((p) => [p.id, Number(p.sessionFee)]))
  const profMap = new Map(profProfiles.map((p) => [p.id, { id: p.id, repassePercentage: Number(p.repassePercentage) }]))
  const cancellationRate = calculateCancellationRate(historicalApts)
  const clinicTaxPct = Number(clinic?.taxPercentage ?? 0)
  const round2 = (n: number) => Math.round(n * 100) / 100

  const revProjection = projectRevenue(
    scheduledAppointments.map((a) => ({ ...a, price: a.price ? Number(a.price) : null })),
    patientFeeMap, profMap, cancellationRate, clinicTaxPct
  )

  const invoicesForCF: InvoiceForCashFlow[] = scheduledAppointments.map((apt) => {
    const fee = apt.price ? Number(apt.price) : (apt.patientId ? patientFeeMap.get(apt.patientId) ?? 0 : 0)
    const adjusted = round2(fee * (1 - cancellationRate))
    return {
      id: `apt-${apt.id}`, totalAmount: adjusted, dueDate: apt.scheduledAt,
      paidAt: null, status: "PROJECTED", patientName: "Sessão",
    }
  })

  // --- EXPENSES: open expenses + recurring projections (deduped) ---
  const expensesForCF: ExpenseForCashFlow[] = openExpenses.map((exp) => ({
    id: exp.id, description: exp.description, amount: Number(exp.amount),
    dueDate: exp.dueDate, paidAt: null, status: exp.status,
  }))

  const existingDates = new Set(openExpenses.filter((e) => e.recurrenceId).map((e) => `${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`))
  const paidRecExpenses = await prisma.expense.findMany({
    where: { clinicId, status: "PAID", recurrenceId: { not: null }, dueDate: { gte: startDate, lte: endDate } },
    select: { recurrenceId: true, dueDate: true },
  })
  paidRecExpenses.forEach((e) => existingDates.add(`${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`))

  const dayBeforeStart = new Date(localStartDate)
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1)

  for (const rec of activeRecurrences) {
    const generated = generateExpensesFromRecurrence({ ...rec, amount: Number(rec.amount), lastGeneratedDate: dayBeforeStart }, localEndDate)
    for (const g of generated) {
      if (g.dueDate < localStartDate || g.dueDate > localEndDate) continue
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
  const taxEstimateData = await buildTaxEstimate(clinicId, nfseConfig, selectedMonth, selectedYear, now, revProjection, startDate, endDate, expensesForCF)

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
        dueDate: new Date(Date.UTC(selectedYear, selectedMonth - 1, 15)),
        paidAt: null, status: "PROJECTED",
      })
    }
  }

  const recurringAndOpenExpenses = expensesForCF.filter(
    (e) => !e.id.startsWith("projected-tax-") && !e.id.startsWith("repasse-")
  )
  const totalProjectedExpenses = recurringAndOpenExpenses.reduce((s, e) => s + e.amount, 0)

  return { invoicesForCF, expensesForCF, revenueProjectionData: revProjection, taxEstimateData, totalProjectedExpenses, totalUnpaidRepasse }
}

// --- Private helper: build tax estimate and push tax expenses into expensesForCF ---
async function buildTaxEstimate(
  clinicId: string,
  nfseConfig: { regimeTributario: string | null; aliquotaIss: { toString(): string } | null } | null,
  selectedMonth: number, selectedYear: number, now: Date,
  revProjection: RevenueProjection,
  startDate: Date, endDate: Date,
  expensesForCF: ExpenseForCashFlow[],
): Promise<TaxEstimate> {
  const regime = nfseConfig?.regimeTributario ?? "3"
  const issRate = nfseConfig?.aliquotaIss ? Number(nfseConfig.aliquotaIss) / 100 : 0.05

  const prevMonthStart = new Date(Date.UTC(selectedYear, selectedMonth - 2, 1))
  const prevMonthEnd = new Date(Date.UTC(selectedYear, selectedMonth - 1, 0))
  const prevMonthRevenue = Number((await prisma.invoice.aggregate({
    where: { clinicId, status: "PAGO", paidAt: { gte: prevMonthStart, lte: prevMonthEnd } },
    _sum: { totalAmount: true },
  }))._sum.totalAmount ?? 0) || revProjection.projectedRevenue

  const quarterMap: Record<number, [number, number]> = {
    4: [0, 2], 7: [3, 5], 10: [6, 8], 1: [9, 11],
  }
  let prevQuarterRevenue: number | undefined
  if (quarterMap[selectedMonth]) {
    const [qStartMonth, qEndMonth] = quarterMap[selectedMonth]
    const qYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
    const qStart = new Date(Date.UTC(qYear, qStartMonth, 1))
    const qEnd = new Date(Date.UTC(qYear, qEndMonth + 1, 0))
    prevQuarterRevenue = Number((await prisma.invoice.aggregate({
      where: { clinicId, status: "PAGO", paidAt: { gte: qStart, lte: qEnd } },
      _sum: { totalAmount: true },
    }))._sum.totalAmount ?? 0) || revProjection.projectedRevenue * 3
  }

  const rbt12 = Number((await prisma.invoice.aggregate({
    where: { clinicId, status: "PAGO", paidAt: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1), lt: now } },
    _sum: { totalAmount: true },
  }))._sum.totalAmount ?? 0)

  const taxEstimateData = estimateTax(regime, prevMonthRevenue, selectedMonth, prevQuarterRevenue, rbt12, issRate)

  if (taxEstimateData.monthlyTotal > 0) {
    const taxDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, 20))
    if (taxDate >= startDate && taxDate <= endDate) {
      expensesForCF.push({ id: "projected-tax-monthly", description: "Impostos mensais (ISS + PIS + COFINS)", amount: taxEstimateData.monthlyTotal, dueDate: taxDate, paidAt: null, status: "PROJECTED" })
    }
  }

  if (taxEstimateData.quarterlyDueThisMonth && taxEstimateData.quarterlyTotal > 0) {
    const taxDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, 20))
    if (taxDate >= startDate && taxDate <= endDate) {
      expensesForCF.push({ id: "projected-tax-quarterly", description: "IRPJ + CSLL (trimestral)", amount: taxEstimateData.quarterlyTotal, dueDate: taxDate, paidAt: null, status: "PROJECTED" })
    }
  }

  return taxEstimateData
}
