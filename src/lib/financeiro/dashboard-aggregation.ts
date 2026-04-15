/**
 * Pure aggregation functions for the financial dashboard.
 * No Prisma or framework dependencies — easy to test.
 */

export interface InvoiceForDashboard {
  referenceMonth: number
  referenceYear: number
  status: string
  totalAmount: unknown // Prisma Decimal — coerced via Number()
  totalSessions: number
  creditsApplied: number
  extrasAdded: number
  invoiceType: string
  professionalProfileId: string
  patientId: string
  professionalProfile: { user: { name: string } }
}

export interface DashboardTotals {
  totalFaturado: number
  totalPendente: number
  totalEnviado: number
  totalParcial: number
  totalPago: number
  totalSessions: number
  totalCredits: number
  totalExtras: number
  invoiceCount: number
  pendingCount: number
  enviadoCount: number
  parcialCount: number
  paidCount: number
}

export interface MonthData {
  faturado: number
  pendente: number
  enviado: number
  parcial: number
  pago: number
  sessions: number
  credits: number
  extras: number
  invoiceCount: number
  pendingCount: number
  enviadoCount: number
  parcialCount: number
  paidCount: number
}

export interface ProfessionalData {
  id: string
  name: string
  faturado: number
  pendente: number
  enviado: number
  parcial: number
  pago: number
  sessions: number
  invoiceCount: number
  patientCount: number
}

export interface PaymentDay {
  day: number
  amount: number
  count: number
  cumulative: number
}

type DeriveGroupStatusFn = (statuses: string[]) => string

// ---------------------------------------------------------------------------
// 1. Apply derived group status for PER_SESSION invoices
// ---------------------------------------------------------------------------

export function applyDerivedGroupStatus<T extends InvoiceForDashboard>(
  invoices: T[],
  deriveGroupStatusFn: DeriveGroupStatusFn
): T[] {
  const perSessionGroups = new Map<string, T[]>()
  for (const inv of invoices) {
    if (inv.invoiceType === "PER_SESSION") {
      const key = `${inv.patientId}-${inv.professionalProfileId}-${inv.referenceMonth}-${inv.referenceYear}`
      const list = perSessionGroups.get(key) || []
      list.push(inv)
      perSessionGroups.set(key, list)
    }
  }

  const groupStatusMap = new Map<string, string>()
  for (const [key, group] of perSessionGroups) {
    const statuses = group.map(i => i.status)
    groupStatusMap.set(key, deriveGroupStatusFn(statuses))
  }

  return invoices.map(inv => {
    if (inv.invoiceType === "PER_SESSION") {
      const key = `${inv.patientId}-${inv.professionalProfileId}-${inv.referenceMonth}-${inv.referenceYear}`
      return { ...inv, status: groupStatusMap.get(key) || inv.status }
    }
    return inv
  })
}

// ---------------------------------------------------------------------------
// 2. Aggregate totals across all invoices
// ---------------------------------------------------------------------------

export function aggregateInvoiceTotals(invoices: InvoiceForDashboard[]): DashboardTotals {
  let totalFaturado = 0
  let totalPendente = 0
  let totalEnviado = 0
  let totalParcial = 0
  let totalPago = 0
  let totalSessions = 0
  let totalCredits = 0
  let totalExtras = 0
  let invoiceCount = 0
  let pendingCount = 0
  let enviadoCount = 0
  let parcialCount = 0
  let paidCount = 0

  for (const inv of invoices) {
    const amount = Number(inv.totalAmount)
    invoiceCount++
    totalFaturado += amount
    totalSessions += inv.totalSessions
    totalCredits += inv.creditsApplied
    totalExtras += inv.extrasAdded

    if (inv.status === "PENDENTE") { totalPendente += amount; pendingCount++ }
    if (inv.status === "ENVIADO") { totalEnviado += amount; enviadoCount++ }
    if (inv.status === "PARCIAL") { totalParcial += amount; parcialCount++ }
    if (inv.status === "PAGO") { totalPago += amount; paidCount++ }
  }

  return {
    totalFaturado, totalPendente, totalEnviado, totalParcial, totalPago,
    totalSessions, totalCredits, totalExtras,
    invoiceCount, pendingCount, enviadoCount, parcialCount, paidCount,
  }
}

// ---------------------------------------------------------------------------
// 3. Group invoices by referenceMonth
// ---------------------------------------------------------------------------

export function groupByMonth(invoices: InvoiceForDashboard[]): Record<number, MonthData> {
  const byMonth: Record<number, MonthData> = {}

  for (const inv of invoices) {
    const amount = Number(inv.totalAmount)
    const m = inv.referenceMonth

    if (!byMonth[m]) {
      byMonth[m] = {
        faturado: 0, pendente: 0, enviado: 0, parcial: 0, pago: 0,
        sessions: 0, credits: 0, extras: 0,
        invoiceCount: 0, pendingCount: 0, enviadoCount: 0, parcialCount: 0, paidCount: 0,
      }
    }

    byMonth[m].faturado += amount
    byMonth[m].sessions += inv.totalSessions
    byMonth[m].credits += inv.creditsApplied
    byMonth[m].extras += inv.extrasAdded
    byMonth[m].invoiceCount++

    if (inv.status === "PENDENTE") { byMonth[m].pendente += amount; byMonth[m].pendingCount++ }
    if (inv.status === "ENVIADO") { byMonth[m].enviado += amount; byMonth[m].enviadoCount++ }
    if (inv.status === "PARCIAL") { byMonth[m].parcial += amount; byMonth[m].parcialCount++ }
    if (inv.status === "PAGO") { byMonth[m].pago += amount; byMonth[m].paidCount++ }
  }

  return byMonth
}

// ---------------------------------------------------------------------------
// 4. Group invoices by professional, sorted by faturado desc
// ---------------------------------------------------------------------------

export function groupByProfessional(invoices: InvoiceForDashboard[]): ProfessionalData[] {
  const byProf: Record<string, {
    name: string
    faturado: number; pendente: number; enviado: number; parcial: number; pago: number
    sessions: number; invoiceCount: number; patientIds: Set<string>
  }> = {}

  for (const inv of invoices) {
    const amount = Number(inv.totalAmount)
    const profId = inv.professionalProfileId

    if (!byProf[profId]) {
      byProf[profId] = {
        name: inv.professionalProfile.user.name,
        faturado: 0, pendente: 0, enviado: 0, parcial: 0, pago: 0,
        sessions: 0, invoiceCount: 0, patientIds: new Set(),
      }
    }

    byProf[profId].faturado += amount
    byProf[profId].sessions += inv.totalSessions
    byProf[profId].invoiceCount++
    byProf[profId].patientIds.add(inv.patientId)

    if (inv.status === "PENDENTE") byProf[profId].pendente += amount
    if (inv.status === "ENVIADO") byProf[profId].enviado += amount
    if (inv.status === "PARCIAL") byProf[profId].parcial += amount
    if (inv.status === "PAGO") byProf[profId].pago += amount
  }

  return Object.entries(byProf)
    .map(([id, p]) => ({
      id,
      name: p.name,
      faturado: p.faturado,
      pendente: p.pendente,
      enviado: p.enviado,
      parcial: p.parcial,
      pago: p.pago,
      sessions: p.sessions,
      invoiceCount: p.invoiceCount,
      patientCount: p.patientIds.size,
    }))
    .sort((a, b) => b.faturado - a.faturado)
}

// ---------------------------------------------------------------------------
// 5. Build payments-by-day with cumulative totals
// ---------------------------------------------------------------------------

export interface PaidInvoiceForDay {
  paidAt: Date | null
  totalAmount: unknown
}

export function buildPaymentsByDay(
  paidInvoices: PaidInvoiceForDay[],
  daysInMonth: number
): PaymentDay[] {
  const byDay = new Map<number, { amount: number; count: number }>()

  for (const inv of paidInvoices) {
    if (!inv.paidAt) continue
    const day = inv.paidAt.getDate()
    const existing = byDay.get(day)
    if (existing) {
      existing.amount += Number(inv.totalAmount)
      existing.count++
    } else {
      byDay.set(day, { amount: Number(inv.totalAmount), count: 1 })
    }
  }

  let cumulative = 0
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const data = byDay.get(day)
    cumulative += data?.amount ?? 0
    return { day, amount: data?.amount ?? 0, count: data?.count ?? 0, cumulative }
  })
}
