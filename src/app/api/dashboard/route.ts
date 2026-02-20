import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { Prisma } from "@prisma/client"

export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (_req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
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

    // Last 30 days
    const thirtyDaysAgo = new Date(todayStart)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

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
    ] = await Promise.all([
      // Today's appointments
      prisma.appointment.count({
        where: {
          ...baseWhere,
          scheduledAt: { gte: todayStart, lt: todayEnd },
        },
      }),

      // Pending (AGENDADO, this week)
      prisma.appointment.count({
        where: {
          ...baseWhere,
          status: "AGENDADO",
          scheduledAt: { gte: now, lt: weekEnd },
        },
      }),

      // This week
      prisma.appointment.count({
        where: {
          ...baseWhere,
          scheduledAt: { gte: weekStart, lt: weekEnd },
        },
      }),

      // Status breakdown for today
      prisma.appointment.groupBy({
        by: ["status"],
        where: {
          ...baseWhere,
          scheduledAt: { gte: todayStart, lt: todayEnd },
        },
        _count: { status: true },
      }),

      // Active patients
      prisma.patient.count({
        where: {
          clinicId: user.clinicId,
          isActive: true,
        },
      }),

      // New patients this month
      prisma.patient.count({
        where: {
          clinicId: user.clinicId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
      }),

      // Completion rate (last 30 days)
      prisma.appointment.groupBy({
        by: ["status"],
        where: {
          ...baseWhere,
          scheduledAt: { gte: thirtyDaysAgo, lt: todayEnd },
          status: { in: ["FINALIZADO", "NAO_COMPARECEU"] },
        },
        _count: { status: true },
      }),

      // Next upcoming appointment
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

      // Today revenue (ADMIN only)
      isAdmin
        ? prisma.appointment.aggregate({
            where: {
              ...baseWhere,
              scheduledAt: { gte: todayStart, lt: todayEnd },
              status: "FINALIZADO",
              price: { not: null },
            },
            _sum: { price: true },
          })
        : null,

      // Monthly revenue (ADMIN only)
      isAdmin
        ? prisma.appointment.aggregate({
            where: {
              ...baseWhere,
              scheduledAt: { gte: monthStart, lt: monthEnd },
              status: "FINALIZADO",
              price: { not: null },
            },
            _sum: { price: true },
          })
        : null,
    ])

    // Compute completion rate
    const finalizadoCount =
      completionStats.find((s) => s.status === "FINALIZADO")?._count.status ?? 0
    const noShowCount =
      completionStats.find((s) => s.status === "NAO_COMPARECEU")?._count.status ?? 0
    const completionTotal = finalizadoCount + noShowCount
    const completionRate =
      completionTotal > 0 ? Math.round((finalizadoCount / completionTotal) * 100) : null

    return NextResponse.json({
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
      nextAppointment: nextAppointment
        ? {
            patientName: nextAppointment.patient?.name ?? nextAppointment.title ?? "—",
            time: nextAppointment.scheduledAt.toISOString(),
            type: nextAppointment.type,
          }
        : null,
      todayRevenue: todayRevenueResult?._sum.price
        ? Number(todayRevenueResult._sum.price)
        : isAdmin
          ? 0
          : null,
      monthlyRevenue: monthlyRevenueResult?._sum.price
        ? Number(monthlyRevenueResult._sum.price)
        : isAdmin
          ? 0
          : null,
    })
  }
)
