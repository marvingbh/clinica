import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { toPortalInvoice } from "@/lib/patient-portal"
import { withPortalSession } from "@/lib/patient-portal/with-portal-session"

/**
 * GET /api/public/portal/[slug]/invoices?patientId=
 * Minimized invoice list for a validated patient profile (FULL scope only).
 */
export const GET = withPortalSession(
  async (req, ctx) => {
    const url = new URL(req.url)
    const patientId = url.searchParams.get("patientId") ?? ""
    if (!ctx.patientIds.includes(patientId)) {
      return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 })
    }

    const invoices = await prisma.invoice.findMany({
      where: { clinicId: ctx.clinic.id, patientId },
      orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
      select: {
        id: true,
        referenceMonth: true,
        referenceYear: true,
        totalAmount: true,
        dueDate: true,
        status: true,
        paidAt: true,
        nfseStatus: true,
        nfseXml: true,
      },
    })

    return NextResponse.json({ invoices: invoices.map(toPortalInvoice) })
  },
  { requireScope: "FULL" },
)
