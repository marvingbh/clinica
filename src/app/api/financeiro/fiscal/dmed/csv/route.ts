import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { loadDmedReport, buildDmedCsv } from "@/lib/fiscal"

/**
 * GET /api/financeiro/fiscal/dmed/csv?year=2025
 * Returns the DMED conference CSV as a download. ADMIN only.
 */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (req, { user }) => {
    if (user.role !== "ADMIN") {
      return forbiddenResponse("A conferência DMED é restrita a administradores.")
    }

    const url = new URL(req.url)
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear() - 1

    const { report } = await loadDmedReport(prisma, user.clinicId, year)
    const csv = buildDmedCsv(report)

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dmed-conferencia-${year}.csv"`,
      },
    })
  }
)
