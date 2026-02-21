import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }) => {
    const url = new URL(req.url)
    const patientId = url.searchParams.get("patientId")
    const status = url.searchParams.get("status") // "available" | "consumed" | null (all)

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
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
