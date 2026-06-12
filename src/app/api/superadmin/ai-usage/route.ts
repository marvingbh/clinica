import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"
import { parseMonthParam } from "@/lib/ai"

/**
 * GET /api/superadmin/ai-usage?month=YYYY-MM — per-clinic AI consumption for a
 * month (default: current UTC month). Aggregates successful generations + token
 * totals, plus 👍/👎 counts. Metadata only — never clinical content.
 */
export const GET = withSuperAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const range = parseMonthParam(searchParams.get("month"), new Date())
  const where = { createdAt: { gte: range.start, lt: range.end }, status: "SUCCESS" as const }

  const [grouped, feedbackGrouped] = await Promise.all([
    prisma.aiUsage.groupBy({
      by: ["clinicId"],
      where,
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true },
    }),
    prisma.aiUsage.groupBy({
      by: ["clinicId", "feedback"],
      where: { ...where, feedback: { not: null } },
      _count: { _all: true },
    }),
  ])

  const clinicIds = grouped.map((g) => g.clinicId)
  const clinics = await prisma.clinic.findMany({
    where: { id: { in: clinicIds } },
    select: { id: true, name: true },
  })
  const nameById = new Map(clinics.map((c) => [c.id, c.name]))

  const positiveById = new Map<string, number>()
  const negativeById = new Map<string, number>()
  for (const f of feedbackGrouped) {
    const target = f.feedback === "POSITIVE" ? positiveById : negativeById
    target.set(f.clinicId, f._count._all)
  }

  const rows = grouped.map((g) => ({
    clinicId: g.clinicId,
    clinicName: nameById.get(g.clinicId) ?? g.clinicId,
    generations: g._count._all,
    tokensIn: g._sum.tokensIn ?? 0,
    tokensOut: g._sum.tokensOut ?? 0,
    positive: positiveById.get(g.clinicId) ?? 0,
    negative: negativeById.get(g.clinicId) ?? 0,
  }))

  rows.sort((a, b) => b.generations - a.generations)

  return NextResponse.json({ rows })
})
