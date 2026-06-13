import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { fetchOverview } from "@/lib/analytics/fetch-overview"
import { overviewCsv } from "@/lib/analytics/csv-reports"
import { csvFilename } from "@/lib/analytics/csv"
import { resolveReportRequest, csvResponse } from "@/lib/analytics/route-helpers"
import { periodLabel } from "@/lib/analytics/period"

export const GET = withFeatureAuth(
  { feature: "reports", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const resolved = await resolveReportRequest(req.url, user)
    if (resolved instanceof NextResponse) return resolved

    const { scope, period, format, includeRevenue } = resolved
    const data = await fetchOverview(scope, new Date(), includeRevenue)

    if (format === "csv") {
      await audit.log({
        user,
        action: AuditAction.REPORT_EXPORTED,
        entityType: "report",
        entityId: "overview",
        newValues: { report: "overview", period: periodLabel(period) },
        request: req,
      })
      return csvResponse(overviewCsv(data), csvFilename("ocupacao", period))
    }

    return NextResponse.json({ period: periodLabel(period), ...data })
  }
)
