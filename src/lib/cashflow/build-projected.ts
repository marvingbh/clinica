import { prisma } from "@/lib/prisma"
import { generateExpensesFromRecurrence } from "@/lib/expenses"
import { calculateCancellationRate, projectRevenue, estimateTax } from "./index"
import type { InvoiceForCashFlow, ExpenseForCashFlow } from "./types"
import type { TaxEstimate } from "./tax-estimate"
import type { RevenueProjection } from "./revenue-projection"
import { buildRealized } from "./build-realized"

interface BuildProjectedParams {
  clinicId: string
  startDate: Date
  endDate: Date
  localStartDate: Date
  localEndDate: Date
  selectedMonth: number
  selectedYear: number
  interBalance: number | null
  balanceFetchedAt: Date | null
}

interface BuildProjectedResult {
  invoicesForCF: InvoiceForCashFlow[]
  expensesForCF: ExpenseForCashFlow[]
  revenueProjectionData: RevenueProjection
  taxEstimateData: TaxEstimate
  totalUnpaidRepasse: number
  // Split metrics for cards
  revenueReceived: number
  revenueProjected: number
  expensesPaid: number
  expensesProjected: number
  startingBalance: number
  balanceSource: string
}

export async function buildProjected({
  clinicId, startDate, endDate, localStartDate, localEndDate,
  selectedMonth, selectedYear, interBalance, balanceFetchedAt,
}: BuildProjectedParams): Promise<BuildProjectedResult> {
  const now = new Date()

  // Get starting balance from realized mode
  const realized = await buildRealized({ clinicId, startDate, endDate, interBalance, balanceFetchedAt })
  const { startingBalance, balanceSource } = realized

  const [
    scheduledAppointments, patients, profProfiles, historicalApts,
    clinic, nfseConfig, activeRecurrences, openExpenses, paidRepasseIds,
    existingInvoices,
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
    // Fetch existing invoices (paid + unpaid) in the date range
    prisma.invoice.findMany({
      where: {
        clinicId,
        status: { notIn: ["CANCELADO"] },
        OR: [
          { paidAt: { gte: startDate, lte: endDate } },
          { dueDate: { gte: startDate, lte: endDate }, paidAt: null },
        ],
      },
      select: { id: true, totalAmount: true, dueDate: true, paidAt: true, status: true, patientId: true, referenceMonth: true, referenceYear: true, patient: { select: { name: true } } },
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

  // --- REVENUE: use existing invoices where available, appointments for the rest ---

  // Track which patients+months are covered by existing invoices
  const invoicedPatientMonths = new Set<string>()
  for (const inv of existingInvoices) {
    if (inv.patientId) {
      invoicedPatientMonths.add(`${inv.patientId}-${inv.referenceMonth}-${inv.referenceYear}`)
    }
  }

  // Real invoices → InvoiceForCashFlow (exact amounts, no cancellation discount)
  const invoiceEntries: InvoiceForCashFlow[] = existingInvoices.map((inv) => ({
    id: inv.id,
    totalAmount: Number(inv.totalAmount),
    dueDate: inv.paidAt ?? inv.dueDate,
    paidAt: inv.paidAt,
    status: inv.status,
    patientName: inv.patient.name,
  }))

  // Synthetic projections only for appointments NOT covered by an invoice
  const uncoveredAppointments = scheduledAppointments.filter((apt) => {
    if (!apt.patientId) return true
    const aptMonth = apt.scheduledAt.getMonth() + 1
    const aptYear = apt.scheduledAt.getFullYear()
    return !invoicedPatientMonths.has(`${apt.patientId}-${aptMonth}-${aptYear}`)
  })

  const syntheticEntries: InvoiceForCashFlow[] = uncoveredAppointments.map((apt) => {
    const fee = apt.price ? Number(apt.price) : (apt.patientId ? patientFeeMap.get(apt.patientId) ?? 0 : 0)
    const adjusted = round2(fee * (1 - cancellationRate))
    return {
      id: `apt-${apt.id}`, totalAmount: adjusted, dueDate: apt.scheduledAt,
      paidAt: null, status: "PROJECTED", patientName: "Sessão",
    }
  })

  const invoicesForCF: InvoiceForCashFlow[] = [...invoiceEntries, ...syntheticEntries]

  // --- EXPENSES: all expenses (paid + open/overdue) + recurring projections ---

  // Fetch paid expenses in the range too (what already happened)
  const paidExpenses = await prisma.expense.findMany({
    where: { clinicId, status: "PAID", paidAt: { gte: startDate, lte: endDate } },
    select: { id: true, description: true, amount: true, dueDate: true, paidAt: true, status: true, recurrenceId: true },
  })

  const allExpenses = [...openExpenses, ...paidExpenses]
  const expensesForCF: ExpenseForCashFlow[] = allExpenses.map((exp) => ({
    id: exp.id, description: exp.description, amount: Number(exp.amount),
    dueDate: exp.paidAt ?? exp.dueDate, paidAt: exp.paidAt, status: exp.status,
  }))

  // Track which recurrence+date combos already have an expense (paid or open)
  const existingDates = new Set(
    allExpenses.filter((e) => e.recurrenceId).map((e) => `${e.recurrenceId}-${e.dueDate.toISOString().split("T")[0]}`)
  )

  const dayBeforeStart = new Date(localStartDate)
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1)

  // Only project recurring expenses that don't already exist (not yet paid/created)
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

  // --- REPASSE: use actual invoice data when invoices exist, estimate otherwise ---
  const paidProfIds = new Set(paidRepasseIds.map((r) => r.professionalProfileId))
  let totalUnpaidRepasse = 0

  const hasInvoicesForMonth = existingInvoices.some(
    (inv) => inv.referenceMonth === selectedMonth && inv.referenceYear === selectedYear
  )

  if (hasInvoicesForMonth) {
    // Calculate repasse from actual invoice items (same logic as /api/financeiro/repasse)
    const invoiceItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: { clinicId, referenceMonth: selectedMonth, referenceYear: selectedYear, status: { notIn: ["CANCELADO"] } },
        type: { not: "CREDITO" },
      },
      select: { total: true, attendingProfessionalId: true, invoice: { select: { professionalProfileId: true } } },
    })

    // Group by attending professional
    const repasseByProf = new Map<string, number>()
    for (const item of invoiceItems) {
      const profId = item.attendingProfessionalId ?? item.invoice.professionalProfileId
      const prof = profMap.get(profId)
      if (!prof || paidProfIds.has(profId)) continue
      const repassePct = prof.repassePercentage / 100
      const afterTax = Number(item.total) * (1 - clinicTaxPct / 100)
      const repasseAmount = round2(afterTax * repassePct)
      repasseByProf.set(profId, (repasseByProf.get(profId) ?? 0) + repasseAmount)
    }

    for (const [profId, amount] of repasseByProf) {
      if (amount > 0) {
        totalUnpaidRepasse += amount
        expensesForCF.push({
          id: `repasse-${profId}`,
          description: "Repasse profissional",
          amount,
          dueDate: new Date(Date.UTC(selectedYear, selectedMonth - 1, 15)),
          paidAt: null, status: "PROJECTED",
        })
      }
    }
  } else {
    // No invoices yet — use appointment-based estimate
    const unpaidRepasse = revProjection.byProfessional.filter((p) => !paidProfIds.has(p.professionalId))
    totalUnpaidRepasse = unpaidRepasse.reduce((s, p) => s + p.estimatedRepasse, 0)

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
  }

  // Split metrics for cards
  const revenueReceived = invoicesForCF.filter(i => i.paidAt).reduce((s, i) => s + i.totalAmount, 0)
  const revenueProjected = invoicesForCF.filter(i => !i.paidAt).reduce((s, i) => s + i.totalAmount, 0)

  const nonTaxNonRepasseExpenses = expensesForCF.filter(
    (e) => !e.id.startsWith("projected-tax-") && !e.id.startsWith("repasse-")
  )
  const expensesPaid = nonTaxNonRepasseExpenses.filter(e => e.paidAt).reduce((s, e) => s + e.amount, 0)
  const expensesProjected = nonTaxNonRepasseExpenses.filter(e => !e.paidAt).reduce((s, e) => s + e.amount, 0)

  return {
    invoicesForCF, expensesForCF, revenueProjectionData: revProjection, taxEstimateData,
    totalUnpaidRepasse, revenueReceived, revenueProjected, expensesPaid, expensesProjected,
    startingBalance, balanceSource,
  }
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
