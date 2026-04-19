import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { Prisma } from "@prisma/client"

export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (_req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const canSeeFinances = meetsMinAccess(user.permissions.finances, "READ")
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)

    // Current week Mon-Sun
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() + mondayOffset)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    // Current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // Last 30 days
    const thirtyDaysAgo = new Date(todayStart)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Revenue chart windows
    const twelveWeekStart = new Date(weekStart)
    twelveWeekStart.setDate(twelveWeekStart.getDate() - 11 * 7)
    const thirtyDayChartStart = new Date(todayStart)
    thirtyDayChartStart.setDate(thirtyDayChartStart.getDate() - 29) // 30 daily buckets ending today
    const twelveMonthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)

    // Base filter: always scope by clinic, optionally by professional
    const baseWhere: Prisma.AppointmentWhereInput = {
      clinicId: user.clinicId,
      ...(!canSeeOthers && user.professionalProfileId
        ? { professionalProfileId: user.professionalProfileId }
        : {}),
    }

    const isAdmin = canSeeOthers

    const [
      todayCount,
      pendingCount,
      weekCount,
      statusBreakdown,
      activePatients,
      newPatientsThisMonth,
      completionStats,
      nextAppointment,
      todayRevenueResult,
      monthlyRevenueResult,
      prevMonthRevenueResult,
      todaySchedule,
      recentInvoices,
      outstandingResult,
      weeklyRevenueRows,
      dailyRevenueRows,
      monthlyRevenueRows,
    ] = await Promise.all([
      prisma.appointment.count({
        where: { ...baseWhere, scheduledAt: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.appointment.count({
        where: { ...baseWhere, status: "AGENDADO", scheduledAt: { gte: now, lt: weekEnd } },
      }),
      prisma.appointment.count({
        where: { ...baseWhere, scheduledAt: { gte: weekStart, lt: weekEnd } },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: { ...baseWhere, scheduledAt: { gte: todayStart, lt: todayEnd } },
        _count: { status: true },
      }),
      prisma.patient.count({ where: { clinicId: user.clinicId, isActive: true } }),
      prisma.patient.count({
        where: { clinicId: user.clinicId, createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: {
          ...baseWhere,
          scheduledAt: { gte: thirtyDaysAgo, lt: todayEnd },
          status: { in: ["FINALIZADO", "CANCELADO_FALTA"] },
        },
        _count: { status: true },
      }),
      prisma.appointment.findFirst({
        where: {
          ...baseWhere,
          scheduledAt: { gte: now },
          status: { in: ["AGENDADO", "CONFIRMADO"] },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          scheduledAt: true,
          type: true,
          title: true,
          patient: { select: { name: true } },
        },
      }),
      // Today / month revenue = PAID invoices in that window.
      // Appointments carry a `price` only in some clinics; invoices are
      // the authoritative financial source in PER_SESSION + MONTHLY_FIXED.
      isAdmin
        ? prisma.invoice.aggregate({
            where: {
              clinicId: user.clinicId,
              status: "PAGO",
              paidAt: { gte: todayStart, lt: todayEnd },
            },
            _sum: { totalAmount: true },
          })
        : null,
      isAdmin
        ? prisma.invoice.aggregate({
            where: {
              clinicId: user.clinicId,
              status: "PAGO",
              paidAt: { gte: monthStart, lt: monthEnd },
            },
            _sum: { totalAmount: true },
          })
        : null,
      isAdmin
        ? prisma.invoice.aggregate({
            where: {
              clinicId: user.clinicId,
              status: "PAGO",
              paidAt: { gte: prevMonthStart, lt: monthStart },
            },
            _sum: { totalAmount: true },
          })
        : null,
      // Today's schedule — when finance panels are hidden the schedule
      // becomes the hero of the page, so fetch a larger slice.
      prisma.appointment.findMany({
        where: {
          ...baseWhere,
          scheduledAt: { gte: todayStart, lt: todayEnd },
          type: "CONSULTA",
        },
        orderBy: { scheduledAt: "asc" },
        take: canSeeFinances ? 6 : 20,
        select: {
          id: true,
          scheduledAt: true,
          endAt: true,
          status: true,
          title: true,
          modality: true,
          patient: { select: { name: true } },
          professionalProfile: { select: { user: { select: { name: true } } } },
        },
      }),
      // Recent invoices (last 5) when the user has finance access
      canSeeFinances
        ? prisma.invoice.findMany({
            where: { clinicId: user.clinicId },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 5,
            select: {
              id: true,
              status: true,
              totalAmount: true,
              paidAt: true,
              referenceMonth: true,
              referenceYear: true,
              patient: { select: { name: true } },
              professionalProfile: { select: { user: { select: { name: true } } } },
            },
          })
        : [],
      // Outstanding amount (PENDENTE + ENVIADO + PARCIAL) this month
      canSeeFinances
        ? prisma.invoice.aggregate({
            where: {
              clinicId: user.clinicId,
              status: { in: ["PENDENTE", "ENVIADO", "PARCIAL"] },
            },
            _sum: { totalAmount: true },
            _count: true,
          })
        : null,
      // Weekly revenue (last 12 weeks). We compute the full dense series
      // in Postgres via generate_series so the client never has to
      // re-align week keys across time zones.
      isAdmin
        ? prisma.$queryRaw<{ bucket: Date; total: number }[]>`
            WITH buckets AS (
              SELECT generate_series(
                date_trunc('week', ${twelveWeekStart}::timestamp),
                date_trunc('week', ${weekStart}::timestamp),
                '1 week'
              ) AS bucket
            )
            SELECT
              b.bucket,
              COALESCE((
                SELECT SUM("totalAmount")::float8
                FROM "Invoice"
                WHERE "clinicId" = ${user.clinicId}
                  AND "status" = 'PAGO'
                  AND "paidAt" >= b.bucket
                  AND "paidAt" < b.bucket + INTERVAL '1 week'
              ), 0) AS total
            FROM buckets b
            ORDER BY b.bucket ASC
          `
        : [],
      // Daily revenue (last 30 days).
      isAdmin
        ? prisma.$queryRaw<{ bucket: Date; total: number }[]>`
            WITH buckets AS (
              SELECT generate_series(
                date_trunc('day', ${thirtyDayChartStart}::timestamp),
                date_trunc('day', ${todayStart}::timestamp),
                '1 day'
              ) AS bucket
            )
            SELECT
              b.bucket,
              COALESCE((
                SELECT SUM("totalAmount")::float8
                FROM "Invoice"
                WHERE "clinicId" = ${user.clinicId}
                  AND "status" = 'PAGO'
                  AND "paidAt" >= b.bucket
                  AND "paidAt" < b.bucket + INTERVAL '1 day'
              ), 0) AS total
            FROM buckets b
            ORDER BY b.bucket ASC
          `
        : [],
      // Monthly revenue (last 12 months).
      isAdmin
        ? prisma.$queryRaw<{ bucket: Date; total: number }[]>`
            WITH buckets AS (
              SELECT generate_series(
                date_trunc('month', ${twelveMonthStart}::timestamp),
                date_trunc('month', ${monthStart}::timestamp),
                '1 month'
              ) AS bucket
            )
            SELECT
              b.bucket,
              COALESCE((
                SELECT SUM("totalAmount")::float8
                FROM "Invoice"
                WHERE "clinicId" = ${user.clinicId}
                  AND "status" = 'PAGO'
                  AND "paidAt" >= b.bucket
                  AND "paidAt" < b.bucket + INTERVAL '1 month'
              ), 0) AS total
            FROM buckets b
            ORDER BY b.bucket ASC
          `
        : [],
    ])

    // Completion rate
    const finalizadoCount =
      completionStats.find((s) => s.status === "FINALIZADO")?._count.status ?? 0
    const noShowCount =
      completionStats.find((s) => s.status === "CANCELADO_FALTA")?._count.status ?? 0
    const completionTotal = finalizadoCount + noShowCount
    const completionRate =
      completionTotal > 0 ? Math.round((finalizadoCount / completionTotal) * 100) : null
    const noShowRate =
      completionTotal > 0 ? (noShowCount / completionTotal) * 100 : null

    const monthlyRevenue = monthlyRevenueResult?._sum.totalAmount
      ? Number(monthlyRevenueResult._sum.totalAmount)
      : isAdmin
        ? 0
        : null
    const prevMonthlyRevenue = prevMonthRevenueResult?._sum.totalAmount
      ? Number(prevMonthRevenueResult._sum.totalAmount)
      : isAdmin
        ? 0
        : null
    const revenueDelta =
      monthlyRevenue !== null && prevMonthlyRevenue !== null && prevMonthlyRevenue > 0
        ? ((monthlyRevenue - prevMonthlyRevenue) / prevMonthlyRevenue) * 100
        : null

    // All three series are already densified by generate_series.
    const toPoints = (rows: { bucket: Date; total: number }[]) =>
      rows.map((r) => ({
        bucketStart: r.bucket.toISOString(),
        total: Number(r.total) || 0,
      }))
    const revenueSeries = {
      day: toPoints(dailyRevenueRows),
      week: toPoints(weeklyRevenueRows),
      month: toPoints(monthlyRevenueRows),
    }

    return NextResponse.json({
      canSeeFinances,
      todayCount,
      pendingCount,
      weekCount,
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s.status,
        count: s._count.status,
      })),
      activePatients,
      newPatientsThisMonth,
      completionRate,
      noShowRate,
      nextAppointment: nextAppointment
        ? {
            patientName: nextAppointment.patient?.name ?? nextAppointment.title ?? "—",
            time: nextAppointment.scheduledAt.toISOString(),
            type: nextAppointment.type,
          }
        : null,
      todayRevenue: todayRevenueResult?._sum.totalAmount
        ? Number(todayRevenueResult._sum.totalAmount)
        : isAdmin
          ? 0
          : null,
      monthlyRevenue,
      prevMonthlyRevenue,
      revenueDelta,
      outstandingAmount: outstandingResult?._sum.totalAmount
        ? Number(outstandingResult._sum.totalAmount)
        : canSeeFinances
          ? 0
          : null,
      outstandingCount: outstandingResult?._count ?? 0,
      todaySchedule: todaySchedule.map((apt) => ({
        id: apt.id,
        scheduledAt: apt.scheduledAt.toISOString(),
        duration: Math.max(
          1,
          Math.round((apt.endAt.getTime() - apt.scheduledAt.getTime()) / 60000)
        ),
        status: apt.status,
        modality: apt.modality,
        title: apt.title,
        patientName: apt.patient?.name ?? apt.title ?? "—",
        professionalName: apt.professionalProfile?.user?.name ?? null,
      })),
      recentInvoices: (recentInvoices ?? []).map((inv) => ({
        id: inv.id,
        status: inv.status,
        amount: Number(inv.totalAmount),
        paidAt: inv.paidAt?.toISOString() ?? null,
        referenceMonth: inv.referenceMonth,
        referenceYear: inv.referenceYear,
        patientName: inv.patient?.name ?? "—",
        professionalName: inv.professionalProfile?.user?.name ?? "—",
      })),
      revenueSeries,
    })
  }
)

