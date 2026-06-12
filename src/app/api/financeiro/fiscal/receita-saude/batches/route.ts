import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

/**
 * GET /api/financeiro/fiscal/receita-saude/batches
 * Lists batches for the clinic (PROFESSIONAL: only their own) with per-status counts.
 */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (_req, { user }) => {
    const where: Record<string, unknown> = { clinicId: user.clinicId }
    if (user.role === "PROFESSIONAL") {
      where.professionalProfileId = user.professionalProfileId ?? "__none__"
    }

    const batches = await prisma.reciboSaudeBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        itemCount: true,
        totalAmount: true,
        resultUploadedAt: true,
        createdAt: true,
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        emissions: { select: { status: true } },
      },
    })

    const result = batches.map((b) => {
      const counts = { EXPORTADO: 0, EMITIDO: 0, ERRO: 0, CANCELADO: 0 } as Record<string, number>
      for (const e of b.emissions) counts[e.status] = (counts[e.status] ?? 0) + 1
      const aggregateStatus =
        counts.ERRO > 0 ? "COM_ERROS" : b.resultUploadedAt ? "PROCESSADO" : "AGUARDANDO"
      return {
        id: b.id,
        fileName: b.fileName,
        itemCount: b.itemCount,
        totalAmount: Number(b.totalAmount),
        resultUploadedAt: b.resultUploadedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        professionalName: b.professionalProfile.user.name,
        counts,
        aggregateStatus,
      }
    })

    return NextResponse.json({ batches: result })
  }
)
