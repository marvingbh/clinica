import { prisma } from "@/lib/prisma"
import { deriveGroupStatus } from "@/lib/financeiro/invoice-grouping"
import {
  applyDerivedGroupStatus,
  groupByProfessional,
} from "@/lib/financeiro/dashboard-aggregation"
import type { DateRange } from "./types"
import { CANCEL_STATUSES, BOOKED_STATUSES, BR_TZ_OFFSET_MINUTES } from "./types"
import { availableMinutes, bookedMinutes, type BookedSlot } from "./occupancy"
import { cancellationBreakdown, type ApptStatusSlim } from "./cancellations"
import { computeRebooking } from "./rebooking"
import { buildComparisonRows, type ComparisonRow } from "./comparison"
import { fetchProfessionals, fetchAvailability, type ReportScope } from "./fetch-shared"
import { monthsInRange } from "./period"

const CANCEL_SET = new Set<string>(CANCEL_STATUSES)
const DAY_MS = 24 * 60 * 60 * 1000

/** attendingProfessionalId ?? professionalProfileId — the prof who actually attended. */
function attributedProf(a: { professionalProfileId: string; attendingProfessionalId: string | null }): string {
  return a.attendingProfessionalId ?? a.professionalProfileId
}

function groupKey(a: { groupId: string | null; sessionGroupId: string | null }): string | null {
  return a.groupId ?? a.sessionGroupId ?? null
}

export interface OverviewResult {
  totals: {
    occupancy: number | null
    sessions: number
    cancellationRate: number
    rebooking7: number | null
    rebooking30: number | null
    newPatients: number
  }
  professionals: ComparisonRow[]
  trend: Array<{ label: string; sessions: number; cancelled: number }>
}

/**
 * Builds the Visão Geral payload. `includeRevenue` is false in own-scope, which
 * keeps revenue/avgTicket null and never reads colleagues' invoices.
 */
export async function fetchOverview(
  scope: ReportScope,
  now: Date,
  includeRevenue: boolean
): Promise<OverviewResult> {
  const { clinicId, professionalProfileId, range } = scope

  const profs = await fetchProfessionals(scope)
  const profIds = profs.map((p) => p.id)

  // All CONSULTA in the period (any status) — scoped by clinic and the attribution prof.
  const appts = await prisma.appointment.findMany({
    where: {
      clinicId,
      type: "CONSULTA",
      scheduledAt: { gte: range.start, lt: range.end },
    },
    select: {
      status: true,
      scheduledAt: true,
      endAt: true,
      professionalProfileId: true,
      attendingProfessionalId: true,
      groupId: true,
      sessionGroupId: true,
      patientId: true,
    },
  })

  // Filter to attribution prof when own-scope / single-prof filter.
  const scopedAppts = professionalProfileId
    ? appts.filter((a) => attributedProf(a) === professionalProfileId)
    : appts

  // Availability per prof.
  const { rulesByProf, exceptionsByProf } = await fetchAvailability(scope, profIds)
  const occupancyByProf = new Map<string, { available: number; booked: number }>()
  for (const id of profIds) {
    const available = availableMinutes(
      rulesByProf.get(id) ?? [],
      exceptionsByProf.get(id) ?? [],
      range,
      now
    )
    const slots: BookedSlot[] = scopedAppts
      .filter((a) => attributedProf(a) === id && BOOKED_STATUSES.includes(a.status as never))
      .map((a) => ({ scheduledAt: a.scheduledAt, endAt: a.endAt, groupKey: groupKey(a) }))
    occupancyByProf.set(id, { available, booked: bookedMinutes(slots) })
  }

  // Cancellations + sessions per prof.
  const cancelByProf = new Map<string, ReturnType<typeof cancellationBreakdown>>()
  const sessionsByProf = new Map<string, number>()
  for (const id of profIds) {
    const list: ApptStatusSlim[] = scopedAppts
      .filter((a) => attributedProf(a) === id)
      .map((a) => ({ status: a.status, scheduledAt: a.scheduledAt }))
    cancelByProf.set(id, cancellationBreakdown(list))
    sessionsByProf.set(id, list.filter((a) => a.status === "FINALIZADO").length)
  }

  // Rebooking: finalized in range + next non-cancelled CONSULTA within 30 days.
  const finalizedInRange = scopedAppts
    .filter((a) => a.status === "FINALIZADO" && a.patientId)
    .map((a) => ({ patientId: a.patientId!, scheduledAt: a.scheduledAt, prof: attributedProf(a) }))

  const nextSessions = await prisma.appointment.findMany({
    where: {
      clinicId,
      type: "CONSULTA",
      status: { notIn: [...CANCEL_STATUSES] },
      patientId: { not: null },
      scheduledAt: { gt: range.start, lte: new Date(range.end.getTime() + 30 * DAY_MS) },
      ...(professionalProfileId
        ? {
            OR: [
              { professionalProfileId },
              { attendingProfessionalId: professionalProfileId },
            ],
          }
        : {}),
    },
    select: { patientId: true, scheduledAt: true, professionalProfileId: true, attendingProfessionalId: true },
  })
  const candidates = nextSessions.map((a) => ({
    patientId: a.patientId!,
    scheduledAt: a.scheduledAt,
    prof: attributedProf(a),
  }))

  const rebookingByProf = new Map<string, number | null>()
  for (const id of profIds) {
    const r = computeRebooking({
      finalizedInRange: finalizedInRange.filter((s) => s.prof === id),
      candidateNextSessions: candidates.filter((s) => s.prof === id),
      windowDays: 7,
    })
    rebookingByProf.set(id, r.rate)
  }

  // Revenue per prof (clinic-scope only) reusing the financeiro aggregation.
  let revenueByProf: Map<string, { revenue: number; sessions: number }> | null = null
  if (includeRevenue) {
    const months = monthsInRange(range)
    const rawInvoices = await prisma.invoice.findMany({
      where: {
        clinicId,
        OR: months.map((m) => ({ referenceYear: m.year, referenceMonth: m.month })),
        ...(professionalProfileId ? { professionalProfileId } : {}),
      },
      select: {
        referenceMonth: true,
        referenceYear: true,
        status: true,
        totalAmount: true,
        totalSessions: true,
        creditsApplied: true,
        extrasAdded: true,
        invoiceType: true,
        professionalProfileId: true,
        professionalProfile: { select: { user: { select: { name: true } } } },
        patientId: true,
      },
    })
    const invoices = applyDerivedGroupStatus(rawInvoices, deriveGroupStatus)
    const byProf = groupByProfessional(invoices)
    revenueByProf = new Map(byProf.map((p) => [p.id, { revenue: p.faturado, sessions: p.sessions }]))
  }

  const professionals = buildComparisonRows({
    profs,
    occupancyByProf,
    cancelByProf,
    sessionsByProf,
    rebookingByProf,
    revenueByProf,
  })

  // Clinic-level totals.
  const allList: ApptStatusSlim[] = scopedAppts.map((a) => ({ status: a.status, scheduledAt: a.scheduledAt }))
  const totalCancel = cancellationBreakdown(allList)
  const sessions = allList.filter((a) => a.status === "FINALIZADO").length

  let totalAvailable = 0
  let totalBooked = 0
  let anyAvailability = false
  for (const v of occupancyByProf.values()) {
    totalAvailable += v.available
    totalBooked += v.booked
    if (v.available > 0) anyAvailability = true
  }
  const occupancy = anyAvailability && totalAvailable > 0 ? totalBooked / totalAvailable : null

  const rebooking7 = computeRebooking({
    finalizedInRange: finalizedInRange.map((s) => ({ patientId: s.patientId, scheduledAt: s.scheduledAt })),
    candidateNextSessions: candidates.map((s) => ({ patientId: s.patientId, scheduledAt: s.scheduledAt })),
    windowDays: 7,
  }).rate
  const rebooking30 = computeRebooking({
    finalizedInRange: finalizedInRange.map((s) => ({ patientId: s.patientId, scheduledAt: s.scheduledAt })),
    candidateNextSessions: candidates.map((s) => ({ patientId: s.patientId, scheduledAt: s.scheduledAt })),
    windowDays: 30,
  }).rate

  const newPatients = await prisma.patient.count({
    where: {
      clinicId,
      createdAt: { gte: range.start, lt: range.end },
      ...(professionalProfileId ? { referenceProfessionalId: professionalProfileId } : {}),
    },
  })

  // Trend: by month (group/year) or by week-of-month (single month).
  const trend = buildTrend(scopedAppts, range)

  return {
    totals: {
      occupancy,
      sessions,
      cancellationRate: totalCancel.rate,
      rebooking7,
      rebooking30,
      newPatients,
    },
    professionals,
    trend,
  }
}

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function buildTrend(
  appts: Array<{ status: string; scheduledAt: Date }>,
  range: DateRange
): Array<{ label: string; sessions: number; cancelled: number }> {
  const months = monthsInRange(range)
  if (months.length <= 1) {
    // Single month: bucket by week of month (local UTC-3).
    const weeks: Array<{ label: string; sessions: number; cancelled: number }> = Array.from(
      { length: 5 },
      (_, i) => ({ label: `Sem ${i + 1}`, sessions: 0, cancelled: 0 })
    )
    for (const a of appts) {
      const local = new Date(a.scheduledAt.getTime() + BR_TZ_OFFSET_MINUTES * 60_000)
      const week = Math.min(4, Math.floor((local.getUTCDate() - 1) / 7))
      if (a.status === "FINALIZADO") weeks[week].sessions++
      if (CANCEL_SET.has(a.status)) weeks[week].cancelled++
    }
    return weeks
  }
  // Multi-month: bucket by month.
  const index = new Map<string, { label: string; sessions: number; cancelled: number }>()
  const order: string[] = []
  for (const m of months) {
    const key = `${m.year}-${m.month}`
    index.set(key, { label: MONTH_SHORT[m.month - 1], sessions: 0, cancelled: 0 })
    order.push(key)
  }
  for (const a of appts) {
    const local = new Date(a.scheduledAt.getTime() + BR_TZ_OFFSET_MINUTES * 60_000)
    const key = `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}`
    const bucket = index.get(key)
    if (!bucket) continue
    if (a.status === "FINALIZADO") bucket.sessions++
    if (CANCEL_SET.has(a.status)) bucket.cancelled++
  }
  return order.map((k) => index.get(k)!)
}
