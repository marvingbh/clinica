import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { fetchInsights } from "@/lib/financeiro/dashboard-insights"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const yearParam = url.searchParams.get("year")

    if (!yearParam) {
      return NextResponse.json({ error: "year is required" }, { status: 400 })
    }

    const year = parseInt(yearParam)
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 })
    }

    const monthParam = url.searchParams.get("month")
    const month = monthParam ? parseInt(monthParam) : null
    if (month !== null && (isNaN(month) || month < 1 || month > 12)) {
      return NextResponse.json({ error: "invalid month (1-12)" }, { status: 400 })
    }

    const insights = await fetchInsights({
      clinicId: user.clinicId,
      professionalProfileId:
        user.role === "ADMIN" ? null : user.professionalProfileId,
      year,
      month,
    })

    return NextResponse.json({ year, month, ...insights })
  }
)
