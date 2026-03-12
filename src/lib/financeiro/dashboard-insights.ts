import { prisma } from "@/lib/prisma"
import { AppointmentType } from "@prisma/client"

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const

const CANCELLED_STATUSES = [
  "CANCELADO_ACORDADO",
  "CANCELADO_FALTA",
  "CANCELADO_PROFISSIONAL",
] as const

interface InsightsParams {
  clinicId: string
  professionalProfileId?: string | null
  year: number
  month: number | null
}

function profScope(params: InsightsParams) {
  return params.professionalProfileId
    ? { professionalProfileId: params.professionalProfileId }
    : {}
}

function periodDates(year: number, month: number | null) {
  if (month) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)
    return { start, end }
  }
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) }
}

function prevPeriod(year: number, month: number | null) {
  if (month) {
    const pm = month === 1 ? 12 : month - 1
    const py = month === 1 ? year - 1 : year
    return { year: py, month: pm as number | null }
  }
  return { year: year - 1, month: null }
}

export async function fetchInsights(params: InsightsParams) {
  const { clinicId, year, month } = params
  const scope = profScope(params)
  const now = new Date()
  const { start, end } = periodDates(year, month)
  const prev = prevPeriod(year, month)

  const invoiceWhere = { clinicId, referenceYear: year, ...scope, ...(month ? { referenceMonth: month } : {}) }
  const prevInvoiceWhere = {
    clinicId, referenceYear: prev.year, ...scope,
    ...(prev.month ? { referenceMonth: prev.month } : {}),
  }
  const apptWhere = { clinicId, type: AppointmentType.CONSULTA, scheduledAt: { gte: start, lt: end }, ...scope }

  const [
    invoices,
    prevInvoices,
    appointments,
    pendingCredits,
  ] = await Promise.all([
    // Current period invoices (all metrics derived from this)
    prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        status: true, totalAmount: true, totalSessions: true,
        dueDate: true, paidAt: true, createdAt: true,
        patientId: true, professionalProfileId: true,
        patient: { select: { name: true } },
        professionalProfile: { select: { user: { select: { name: true } } } },
      },
    }),
    // Previous period invoices (for comparison)
    prisma.invoice.findMany({
      where: prevInvoiceWhere,
      select: { status: true, totalAmount: true, totalSessions: true },
    }),
    // Appointments for cancellation + weekday sessions
    prisma.appointment.findMany({
      where: apptWhere,
      select: { status: true, price: true, scheduledAt: true },
    }),
    // Pending credits (unconsumed)
    prisma.sessionCredit.findMany({
      where: { clinicId, ...scope, consumedByInvoiceId: null },
      select: { createdAt: true },
    }),
  ])

  // Previous period paid invoices for collection time comparison
  const prevPaidInvoices = await prisma.invoice.findMany({
    where: { ...prevInvoiceWhere, status: "PAGO", paidAt: { not: null } },
    select: { createdAt: true, paidAt: true },
  })

  const paidCurrent = invoices.filter(i => i.status === "PAGO" && i.paidAt)

  return {
    inadimplencia: buildInadimplencia(invoices),
    pagamentoAtraso: buildPagamentoAtraso(invoices),
    tempoRecebimento: buildCollectionTime(paidCurrent, prevPaidInvoices),
    ticketMedio: buildTicketMedio(invoices),
    cancelamento: buildCancelamento(appointments),
    concentracao: buildConcentracao(invoices),
    creditosAging: buildCreditsAging(pendingCredits, now),
    comparativo: buildComparativo(invoices, prevInvoices),
    receitaPorDia: buildRevenueByWeekday(appointments),
  }
}

type InvoiceSlim = { status: string; totalAmount: unknown }
type InvoiceFull = InvoiceSlim & {
  totalSessions: number; patientId: string; professionalProfileId: string
  dueDate: Date | null; paidAt: Date | null; createdAt: Date
  patient: { name: string }
  professionalProfile: { user: { name: string } }
}

function buildInadimplencia(invoices: InvoiceFull[]) {
  const nonCancelled = invoices.filter((i) => i.status !== "CANCELADO")
  const unpaid = nonCancelled.filter((i) => i.status !== "PAGO")
  const unpaidAmount = unpaid.reduce((s, i) => s + Number(i.totalAmount), 0)
  const unpaidRate = nonCancelled.length > 0 ? unpaid.length / nonCancelled.length : 0
  return {
    unpaidCount: unpaid.length,
    unpaidAmount,
    unpaidRate: Math.round(unpaidRate * 1000) / 1000,
  }
}

function buildPagamentoAtraso(invoices: InvoiceFull[]) {
  const paid = invoices.filter((i) => i.status === "PAGO" && i.paidAt && i.dueDate)
  const late = paid.filter((i) => i.paidAt!.getTime() > i.dueDate!.getTime())
  const lateAmount = late.reduce((s, i) => s + Number(i.totalAmount), 0)
  const lateRate = paid.length > 0 ? late.length / paid.length : 0
  const avgDaysLate = late.length > 0
    ? Math.round(late.reduce((s, i) =>
        s + (i.paidAt!.getTime() - i.dueDate!.getTime()) / 86_400_000, 0,
      ) / late.length * 10) / 10
    : 0
  return {
    lateCount: late.length,
    totalPaid: paid.length,
    lateAmount,
    lateRate: Math.round(lateRate * 1000) / 1000,
    avgDaysLate,
  }
}

function avgDays(invoices: { createdAt: Date; paidAt: Date | null }[]) {
  if (invoices.length === 0) return null
  const total = invoices.reduce((sum, inv) => {
    const diff = (inv.paidAt!.getTime() - inv.createdAt.getTime()) / 86_400_000
    return sum + diff
  }, 0)
  return Math.round((total / invoices.length) * 10) / 10
}

function buildCollectionTime(
  current: { createdAt: Date; paidAt: Date | null }[],
  previous: { createdAt: Date; paidAt: Date | null }[],
) {
  return { avgCollectionDays: avgDays(current), prevAvgCollectionDays: avgDays(previous) }
}

function buildTicketMedio(invoices: InvoiceFull[]) {
  const active = invoices.filter((i) => i.status !== "CANCELADO")
  const totalFaturado = active.reduce((s, i) => s + Number(i.totalAmount), 0)
  const totalSessions = active.reduce((s, i) => s + i.totalSessions, 0)
  const avgTicket = totalSessions > 0 ? Math.round((totalFaturado / totalSessions) * 100) / 100 : 0

  const byProf: Record<string, { name: string; amount: number; sessions: number }> = {}
  for (const inv of active) {
    const pid = inv.professionalProfileId
    if (!byProf[pid]) byProf[pid] = { name: inv.professionalProfile.user.name, amount: 0, sessions: 0 }
    byProf[pid].amount += Number(inv.totalAmount)
    byProf[pid].sessions += inv.totalSessions
  }
  const avgTicketByProfessional = Object.entries(byProf).map(([professionalId, p]) => ({
    professionalId,
    name: p.name,
    avgTicket: p.sessions > 0 ? Math.round((p.amount / p.sessions) * 100) / 100 : 0,
  }))

  return { avgTicket, avgTicketByProfessional }
}

type ApptSlim = { status: string; price: unknown; scheduledAt: Date }

function buildCancelamento(appointments: ApptSlim[]) {
  const total = appointments.length
  const cancelled = appointments.filter((a) =>
    (CANCELLED_STATUSES as readonly string[]).includes(a.status),
  )
  const falta = appointments.filter((a) => a.status === "CANCELADO_FALTA")
  const cancellationRate = total > 0 ? Math.round((cancelled.length / total) * 1000) / 1000 : 0
  const estimatedLostRevenue = falta.reduce((s, a) => s + Number(a.price || 0), 0)

  return {
    totalAppointments: total,
    cancelledCount: cancelled.length,
    faltaCount: falta.length,
    cancellationRate,
    estimatedLostRevenue,
  }
}

function buildConcentracao(invoices: InvoiceFull[]) {
  const active = invoices.filter((i) => i.status !== "CANCELADO")
  const byPatient: Record<string, { name: string; amount: number }> = {}
  let totalRevenue = 0
  for (const inv of active) {
    const pid = inv.patientId
    if (!byPatient[pid]) byPatient[pid] = { name: inv.patient.name, amount: 0 }
    byPatient[pid].amount += Number(inv.totalAmount)
    totalRevenue += Number(inv.totalAmount)
  }

  const sorted = Object.entries(byPatient)
    .map(([patientId, p]) => ({
      patientId,
      patientName: p.name,
      amount: Math.round(p.amount * 100) / 100,
      percentOfTotal: totalRevenue > 0 ? Math.round((p.amount / totalRevenue) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  const topPatients = sorted.slice(0, 5)
  const top3Amount = sorted.slice(0, 3).reduce((s, p) => s + p.amount, 0)
  const top3Concentration = totalRevenue > 0 ? Math.round((top3Amount / totalRevenue) * 10000) / 10000 : 0

  return { topPatients, top3Concentration }
}

function buildCreditsAging(credits: { createdAt: Date }[], now: Date) {
  const buckets = [
    { key: "credits0to30", min: 0, max: 30 },
    { key: "credits31to60", min: 31, max: 60 },
    { key: "credits61to90", min: 61, max: 90 },
    { key: "creditsOver90", min: 91, max: Infinity },
  ] as const

  const result: Record<string, { count: number; totalDays: number }> = {}
  for (const b of buckets) result[b.key] = { count: 0, totalDays: 0 }

  for (const c of credits) {
    const age = Math.floor((now.getTime() - c.createdAt.getTime()) / 86_400_000)
    const bucket = buckets.find((b) => age >= b.min && age <= b.max)!
    result[bucket.key].count++
    result[bucket.key].totalDays += age
  }

  // Convert totalDays to average
  for (const b of buckets) {
    const r = result[b.key]
    r.totalDays = r.count > 0 ? Math.round((r.totalDays / r.count) * 10) / 10 : 0
  }

  return result
}

function buildComparativo(current: InvoiceSlim[], previous: InvoiceSlim[]) {
  const sum = (inv: InvoiceSlim[], filter?: string) =>
    inv
      .filter((i) => i.status !== "CANCELADO" && (!filter || i.status === filter))
      .reduce((s, i) => s + Number(i.totalAmount), 0)

  const sessions = (inv: (InvoiceSlim & { totalSessions?: number })[]) =>
    inv.filter((i) => i.status !== "CANCELADO").reduce((s, i) => s + (i.totalSessions || 0), 0)

  const curFaturado = sum(current)
  const curPago = sum(current, "PAGO")
  const curSessions = sessions(current as (InvoiceSlim & { totalSessions: number })[])
  const prevFaturado = sum(previous)
  const prevPago = sum(previous, "PAGO")
  const prevSessions = sessions(previous as (InvoiceSlim & { totalSessions: number })[])

  const delta = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 10000) / 100 : null

  return {
    prevFaturado, prevPago, prevSessions,
    deltaFaturado: delta(curFaturado, prevFaturado),
    deltaPago: delta(curPago, prevPago),
    deltaSessions: delta(curSessions, prevSessions),
  }
}

function buildRevenueByWeekday(appointments: ApptSlim[]) {
  const finalized = appointments.filter((a) => a.status === "FINALIZADO")
  const weekdays = WEEKDAY_LABELS.map((day) => ({ day, revenue: 0, sessions: 0 }))

  for (const a of finalized) {
    const dow = a.scheduledAt.getDay() // 0=Sun
    weekdays[dow].revenue += Number(a.price || 0)
    weekdays[dow].sessions++
  }

  // Round revenues
  for (const w of weekdays) w.revenue = Math.round(w.revenue * 100) / 100

  return weekdays
}
