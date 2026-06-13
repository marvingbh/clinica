import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { fetchOrigins } from "@/lib/analytics/fetch-origins"
import { originsCsv } from "@/lib/analytics/csv-reports"
import { csvFilename } from "@/lib/analytics/csv"
import { resolveReportRequest, csvResponse } from "@/lib/analytics/route-helpers"
import { periodLabel } from "@/lib/analytics/period"

export const GET = withFeatureAuth(
  { feature: "reports", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const resolved = await resolveReportRequest(req.url, user)
    if (resolved instanceof NextResponse) return resolved

    const { scope, period, format } = resolved
    const data = await fetchOrigins(scope)

    if (format === "csv") {
      await audit.log({
        user,
        action: AuditAction.REPORT_EXPORTED,
        entityType: "report",
        entityId: "origens",
        newValues: { report: "origens", period: periodLabel(period) },
        request: req,
      })
      return csvResponse(originsCsv(data), csvFilename("origens", period))
    }

    return NextResponse.json({ period: periodLabel(period), ...data })
  }
)
