import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { fetchRetention } from "@/lib/analytics/fetch-retention"
import { retentionCsv } from "@/lib/analytics/csv-reports"
import { csvFilename } from "@/lib/analytics/csv"
import { resolveReportRequest, csvResponse } from "@/lib/analytics/route-helpers"
import { periodLabel } from "@/lib/analytics/period"

export const GET = withFeatureAuth(
  { feature: "reports", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const resolved = await resolveReportRequest(req.url, user)
    if (resolved instanceof NextResponse) return resolved

    const { scope, period, format } = resolved
    const data = await fetchRetention(scope, new Date())

    if (format === "csv") {
      await audit.log({
        user,
        action: AuditAction.REPORT_EXPORTED,
        entityType: "report",
        entityId: "retencao",
        newValues: { report: "retencao", period: periodLabel(period) },
        request: req,
      })
      return csvResponse(retentionCsv(data), csvFilename("sem-retorno", period))
    }

    return NextResponse.json({ period: periodLabel(period), ...data })
  }
)
