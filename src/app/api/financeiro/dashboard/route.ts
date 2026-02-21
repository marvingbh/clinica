import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }) => {
    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()))

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      referenceYear: year,
    }

    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    }

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        referenceMonth: true,
        status: true,
        totalAmount: true,
      },
    })

    let totalFaturado = 0
    let totalPendente = 0
    let totalPago = 0
    const byMonth: Record<number, { faturado: number; pendente: number; pago: number }> = {}

    for (const inv of invoices) {
      const amount = Number(inv.totalAmount)
      totalFaturado += amount
      if (inv.status === "PENDENTE") totalPendente += amount
      if (inv.status === "PAGO") totalPago += amount

      if (!byMonth[inv.referenceMonth]) {
        byMonth[inv.referenceMonth] = { faturado: 0, pendente: 0, pago: 0 }
      }
      byMonth[inv.referenceMonth].faturado += amount
      if (inv.status === "PENDENTE") byMonth[inv.referenceMonth].pendente += amount
      if (inv.status === "PAGO") byMonth[inv.referenceMonth].pago += amount
    }

    const creditWhere: Record<string, unknown> = {
      clinicId: user.clinicId,
      consumedByInvoiceId: null,
    }
    if (scope === "own" && user.professionalProfileId) {
      creditWhere.professionalProfileId = user.professionalProfileId
    }
    const availableCredits = await prisma.sessionCredit.count({ where: creditWhere })

    return NextResponse.json({
      year,
      totalFaturado,
      totalPendente,
      totalPago,
      availableCredits,
      byMonth,
    })
  }
)
