import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/financeiro/faturas/[id]/nfse/historico
 * Returns the NFS-e emission/cancellation history for an invoice from AdnLog.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    // Verify invoice belongs to clinic
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    const logs = await prisma.adnLog.findMany({
      where: { invoiceId: params.id, clinicId: user.clinicId },
      select: {
        id: true,
        operation: true,
        statusCode: true,
        error: true,
        durationMs: true,
        createdAt: true,
        // Don't expose full request/response XML to UI — only for DB-level investigation
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json({ logs })
  }
)
