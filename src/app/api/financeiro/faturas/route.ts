import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const url = new URL(req.url)
    const month = url.searchParams.get("month") ? parseInt(url.searchParams.get("month")!) : undefined
    const year = url.searchParams.get("year") ? parseInt(url.searchParams.get("year")!) : undefined
    const status = url.searchParams.get("status") || undefined
    const professionalId = url.searchParams.get("professionalId") || undefined
    const patientId = url.searchParams.get("patientId") || undefined
    const patientSearch = url.searchParams.get("patientSearch") || undefined

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (professionalId) {
      where.professionalProfileId = professionalId
    }

    if (month) where.referenceMonth = month
    if (year) where.referenceYear = year
    if (status) where.status = status
    if (patientId) where.patientId = patientId
    if (patientSearch) {
      where.patient = { name: { contains: patientSearch, mode: "insensitive" } }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true } },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: [{ patient: { name: "asc" } }, { referenceYear: "desc" }, { referenceMonth: "desc" }],
    })

    return NextResponse.json(invoices)
  }
)
