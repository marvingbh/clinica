import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { z } from "zod"
import { cancelNfse, type AdnConfig } from "@/lib/nfse/adn-client"
import { computeAggregateNfseStatus } from "@/lib/nfse/emission-service"

const cancelSchema = z.object({
  motivo: z.string().min(1, "Motivo do cancelamento obrigatorio"),
  codigoMotivo: z.number().int().min(1).max(6, "Codigo do motivo deve ser entre 1 e 6"),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const url = new URL(req.url)
    const emissionId = url.searchParams.get("emissionId")

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        clinic: { include: { nfseConfig: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    // Parse and validate body
    const body = await req.json()
    const parsed = cancelSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { motivo, codigoMotivo } = parsed.data
    const nfseConfig = invoice.clinic.nfseConfig
    if (!nfseConfig) {
      return NextResponse.json({ error: "Configuracao NFS-e nao encontrada" }, { status: 400 })
    }

    const adnConfig: AdnConfig = {
      clinicId: user.clinicId,
      invoiceId: invoice.id,
      certificatePem: nfseConfig.certificatePem,
      privateKeyPem: nfseConfig.privateKeyPem,
      useSandbox: nfseConfig.useSandbox,
    }

    // Per-item cancellation
    if (emissionId) {
      const emission = await prisma.nfseEmission.findFirst({
        where: { id: emissionId, invoiceId: invoice.id },
      })
      if (!emission) {
        return NextResponse.json({ error: "Emissao nao encontrada" }, { status: 404 })
      }
      if (emission.status !== "EMITIDA") {
        return NextResponse.json({ error: "Somente emissoes com status EMITIDA podem ser canceladas" }, { status: 400 })
      }
      if (!emission.chaveAcesso) {
        return NextResponse.json({ error: "Emissao sem chave de acesso" }, { status: 400 })
      }

      try {
        await cancelNfse(emission.chaveAcesso, motivo, codigoMotivo, nfseConfig.cnpj, adnConfig)

        await prisma.nfseEmission.update({
          where: { id: emissionId },
          data: { status: "CANCELADA", canceladaAt: new Date(), cancelamentoMotivo: motivo },
        })

        // Recompute aggregate
        const allEmissions = await prisma.nfseEmission.findMany({
          where: { invoiceId: invoice.id },
          select: { status: true },
        })
        const aggregate = computeAggregateNfseStatus(allEmissions.map(e => e.status) as Array<"PENDENTE" | "EMITIDA" | "ERRO" | "CANCELADA">)
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { nfseStatus: aggregate, notaFiscalEmitida: aggregate === "EMITIDA", notaFiscalEmitidaAt: aggregate === "EMITIDA" ? new Date() : null },
        })

        audit.log({ user, action: AuditAction.NFSE_CANCELADA, entityType: "Invoice", entityId: invoice.id, newValues: { emissionId, nfseStatus: "CANCELADA", motivo }, request: req }).catch(() => {})
        return NextResponse.json({ success: true, nfseStatus: aggregate })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
        audit.log({ user, action: AuditAction.NFSE_ERRO, entityType: "Invoice", entityId: invoice.id, newValues: { emissionId, erro: errorMessage, operacao: "cancelamento" }, request: req }).catch(() => {})
        return NextResponse.json({ error: `Erro ao cancelar NFS-e: ${errorMessage}` }, { status: 500 })
      }
    }

    // Per-invoice cancellation (original behavior)
    if (invoice.nfseStatus !== "EMITIDA") {
      return NextResponse.json(
        { error: "Somente NFS-e com status EMITIDA pode ser cancelada" },
        { status: 400 }
      )
    }
    if (!invoice.nfseChaveAcesso) {
      return NextResponse.json(
        { error: "NFS-e nao possui chave de acesso. Nao e possivel cancelar." },
        { status: 400 }
      )
    }

    try {
      await cancelNfse(invoice.nfseChaveAcesso, motivo, codigoMotivo, nfseConfig.cnpj, adnConfig)

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseStatus: null, nfseNumero: null, nfseChaveAcesso: null, nfseCodigoVerificacao: null,
          nfseEmitidaAt: null, nfseErro: null, nfseCodigoServico: null, nfseDescricao: null,
          nfseAliquotaIss: null, nfseCanceladaAt: null, nfseCancelamentoMotivo: null,
          notaFiscalEmitida: false, notaFiscalEmitidaAt: null,
        },
      })

      audit.log({ user, action: AuditAction.NFSE_CANCELADA, entityType: "Invoice", entityId: invoice.id, oldValues: { nfseStatus: "EMITIDA", nfseNumero: invoice.nfseNumero }, newValues: { nfseStatus: "CANCELADA", codigoMotivo, motivo }, request: req }).catch(() => {})
      return NextResponse.json({ success: true, nfseStatus: "CANCELADA", message: "NFS-e cancelada com sucesso." })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
      audit.log({ user, action: AuditAction.NFSE_ERRO, entityType: "Invoice", entityId: invoice.id, newValues: { nfseStatus: "ERRO", erro: errorMessage, operacao: "cancelamento" }, request: req }).catch(() => {})
      return NextResponse.json({ error: `Erro ao cancelar NFS-e: ${errorMessage}` }, { status: 500 })
    }
  }
)
