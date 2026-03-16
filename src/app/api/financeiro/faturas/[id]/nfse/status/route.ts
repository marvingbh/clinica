import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      select: {
        id: true,
        nfseStatus: true,
        nfseNumero: true,
        nfseChaveAcesso: true,
        nfseCodigoVerificacao: true,
        nfseEmitidaAt: true,
        nfseErro: true,
        nfseCanceladaAt: true,
        nfseCancelamentoMotivo: true,
        nfseCodigoServico: true,
        nfseDescricao: true,
        nfseAliquotaIss: true,
        nfseEmissions: {
          select: {
            id: true,
            invoiceItemId: true,
            status: true,
            numero: true,
            chaveAcesso: true,
            codigoVerificacao: true,
            emitidaAt: true,
            erro: true,
            canceladaAt: true,
            cancelamentoMotivo: true,
            descricao: true,
            valor: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    return NextResponse.json({
      invoiceId: invoice.id,
      nfseStatus: invoice.nfseStatus,
      nfseNumero: invoice.nfseNumero,
      nfseChaveAcesso: invoice.nfseChaveAcesso,
      nfseCodigoVerificacao: invoice.nfseCodigoVerificacao,
      nfseEmitidaAt: invoice.nfseEmitidaAt,
      nfseErro: invoice.nfseErro,
      nfseCanceladaAt: invoice.nfseCanceladaAt,
      nfseCancelamentoMotivo: invoice.nfseCancelamentoMotivo,
      emission: invoice.nfseCodigoServico
        ? {
            codigoServico: invoice.nfseCodigoServico,
            descricao: invoice.nfseDescricao,
            aliquotaIss: invoice.nfseAliquotaIss
              ? Number(invoice.nfseAliquotaIss)
              : null,
          }
        : null,
      // Per-item emissions (empty array for per-invoice mode)
      emissions: invoice.nfseEmissions.map(e => ({
        ...e,
        valor: Number(e.valor),
      })),
    })
  }
)
