import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { fetchCancellations } from "@/lib/analytics/fetch-cancellations"
import { cancellationsCsv } from "@/lib/analytics/csv-reports"
import { csvFilename } from "@/lib/analytics/csv"
import { resolveReportRequest, csvResponse } from "@/lib/analytics/route-helpers"
import { periodLabel } from "@/lib/analytics/period"

export const GET = withFeatureAuth(
  { feature: "reports", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const resolved = await resolveReportRequest(req.url, user)
    if (resolved instanceof NextResponse) return resolved

    const { scope, period, format } = resolved
    const data = await fetchCancellations(scope)

    if (format === "csv") {
      await audit.log({
        user,
        action: AuditAction.REPORT_EXPORTED,
        entityType: "report",
        entityId: "cancelamentos",
        newValues: { report: "cancelamentos", period: periodLabel(period) },
        request: req,
      })
      return csvResponse(cancellationsCsv(data), csvFilename("cancelamentos", period))
    }

    return NextResponse.json({ period: periodLabel(period), ...data })
  }
)
