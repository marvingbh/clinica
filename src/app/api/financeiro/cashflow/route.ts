import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  calculateProjection,
  detectAlerts,
  aggregateByWeek,
  aggregateByMonth,
  buildRealized,
  buildProjected,
} from "@/lib/cashflow"
import type { Granularity } from "@/lib/cashflow"

function parseUTCDate(str: string): Date {
  return new Date(str + "T00:00:00.000Z")
}
function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const startDateStr = url.searchParams.get("startDate")
    const endDateStr = url.searchParams.get("endDate")
    const rawGranularity = url.searchParams.get("granularity") ?? "daily"
    const granularity: Granularity = ["daily", "weekly", "monthly"].includes(rawGranularity)
      ? (rawGranularity as Granularity)
      : "daily"
    const mode = url.searchParams.get("mode") ?? "realizado"

    const now = new Date()
    const startDate = startDateStr ? parseUTCDate(startDateStr) : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    const endDate = endDateStr ? parseUTCDate(endDateStr) : new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))
    const localStartDate = startDateStr ? parseLocalDate(startDateStr) : new Date(now.getFullYear(), now.getMonth(), 1)
    const localEndDate = endDateStr ? parseLocalDate(endDateStr) : new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    const selectedMonth = localStartDate.getMonth() + 1
    const selectedYear = localStartDate.getFullYear()

    const bankIntegration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
      select: { lastKnownBalance: true, balanceFetchedAt: true },
    })
    const interBalance = bankIntegration?.lastKnownBalance ? Number(bankIntegration.lastKnownBalance) : null

    if (mode !== "projetado") {
      const { invoicesForCF, expensesForCF, startingBalance, balanceSource } = await buildRealized({
        clinicId: user.clinicId, startDate, endDate, interBalance,
        balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
      })

      const projection = calculateProjection(invoicesForCF, expensesForCF, [], startDate, endDate, startingBalance)
      const alerts = detectAlerts(projection, "realizado", interBalance !== null)
      let entries = projection.entries
      if (granularity === "weekly") entries = aggregateByWeek(entries)
      if (granularity === "monthly") entries = aggregateByMonth(entries)

      return NextResponse.json({
        entries, alerts, summary: projection.summary, balanceSource, todayDivider: todayStr,
        lastKnownBalance: interBalance, balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
      })
    }

    const { invoicesForCF, expensesForCF, revenueProjectionData, taxEstimateData, totalProjectedExpenses, totalUnpaidRepasse } = await buildProjected({
      clinicId: user.clinicId, startDate, endDate, localStartDate, localEndDate,
      selectedMonth, selectedYear,
    })

    const projection = calculateProjection(invoicesForCF, expensesForCF, [], startDate, endDate, 0, todayStr)
    let entries = projection.entries
    if (granularity === "weekly") entries = aggregateByWeek(entries)
    if (granularity === "monthly") entries = aggregateByMonth(entries)

    return NextResponse.json({
      entries,
      alerts: detectAlerts(projection, "projetado"),
      summary: projection.summary,
      balanceSource: "none",
      lastKnownBalance: interBalance,
      balanceFetchedAt: bankIntegration?.balanceFetchedAt ?? null,
      todayDivider: todayStr,
      revenueProjection: {
        totalAppointments: revenueProjectionData.totalAppointments,
        grossRevenue: revenueProjectionData.grossRevenue,
        cancellationRate: revenueProjectionData.cancellationRate,
        projectedRevenue: revenueProjectionData.projectedRevenue,
        totalEstimatedRepasse: totalUnpaidRepasse,
        actualRevenue: 0,
      },
      taxEstimate: taxEstimateData,
      projectedExpenses: totalProjectedExpenses,
    })
  }
)
