import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const url = new URL(req.url)
    const patientId = url.searchParams.get("patientId")
    const status = url.searchParams.get("status") // "available" | "consumed" | null (all)
    const yearParam = url.searchParams.get("year")
    const monthParam = url.searchParams.get("month")

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (yearParam) {
      const y = Number(yearParam)
      const m = monthParam ? Number(monthParam) : null
      const start = m ? new Date(y, m - 1, 1) : new Date(y, 0, 1)
      const end = m ? new Date(y, m, 1) : new Date(y + 1, 0, 1)

      // Primary: match on invoice referenceYear/referenceMonth if consumed
      // Fallback: match on createdAt if no invoice
      const invoiceFilter: Record<string, unknown> = { referenceYear: y }
      if (m) invoiceFilter.referenceMonth = m

      where.OR = [
        { consumedByInvoice: invoiceFilter },
        { consumedByInvoiceId: null, createdAt: { gte: start, lt: end } },
      ]
    }

    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    }

    if (patientId) where.patientId = patientId

    if (status === "available") {
      where.consumedByInvoiceId = null
    } else if (status === "consumed") {
      where.consumedByInvoiceId = { not: null }
    }

    const credits = await prisma.sessionCredit.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true } },
        originAppointment: { select: { id: true, scheduledAt: true } },
        consumedByInvoice: { select: { id: true, referenceMonth: true, referenceYear: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(credits)
  }
)
