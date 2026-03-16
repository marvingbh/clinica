import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { z } from "zod"
import { cancelNfse, type AdnConfig } from "@/lib/nfse/adn-client"

const cancelSchema = z.object({
  motivo: z.string().min(1, "Motivo do cancelamento obrigatorio"),
  codigoMotivo: z.number().int().min(1).max(6, "Codigo do motivo deve ser entre 1 e 6"),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        clinic: { include: { nfseConfig: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    // Validate NFS-e is in emitted state
    if (invoice.nfseStatus !== "EMITIDA") {
      return NextResponse.json(
        { error: "Somente NFS-e com status EMITIDA pode ser cancelada" },
        { status: 400 }
      )
    }

    // Validate chave de acesso exists
    if (!invoice.nfseChaveAcesso) {
      return NextResponse.json(
        { error: "NFS-e nao possui chave de acesso. Nao e possivel cancelar." },
        { status: 400 }
      )
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

    try {
      // Try ADN cancellation API — may fail in sandbox
      const nfseConfig = invoice.clinic.nfseConfig
      let adnCancelFailed = false
      if (nfseConfig) {
        try {
          const adnConfig: AdnConfig = {
            certificatePem: nfseConfig.certificatePem,
            privateKeyPem: nfseConfig.privateKeyPem,
            useSandbox: nfseConfig.useSandbox,
          }
          await cancelNfse(invoice.nfseChaveAcesso, motivo, codigoMotivo, adnConfig)
        } catch (adnError) {
          console.error("[NFS-e Cancel] ADN error (proceeding with local cancellation):", adnError instanceof Error ? adnError.message : adnError)
          adnCancelFailed = true
        }
      }

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseStatus: "CANCELADA",
          nfseCanceladaAt: new Date(),
          nfseCancelamentoMotivo: `[${codigoMotivo}] ${motivo}`,
        },
      })

      audit
        .log({
          user,
          action: AuditAction.NFSE_CANCELADA,
          entityType: "Invoice",
          entityId: invoice.id,
          oldValues: {
            nfseStatus: "EMITIDA",
            nfseNumero: invoice.nfseNumero,
          },
          newValues: {
            nfseStatus: "CANCELADA",
            codigoMotivo,
            motivo,
          },
          request: req,
        })
        .catch(() => {})

      return NextResponse.json({
        success: true,
        nfseStatus: "CANCELADA",
        message: adnCancelFailed
          ? "NFS-e cancelada localmente. O cancelamento no ADN falhou — cancele manualmente no portal gov.br se necessario."
          : "NFS-e cancelada com sucesso.",
        adnCancelFailed,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
      console.error("[NFS-e Cancel] Error:", errorMessage)

      audit
        .log({
          user,
          action: AuditAction.NFSE_ERRO,
          entityType: "Invoice",
          entityId: invoice.id,
          newValues: { nfseStatus: "ERRO", erro: errorMessage, operacao: "cancelamento" },
          request: req,
        })
        .catch(() => {})

      return NextResponse.json(
        { error: `Erro ao cancelar NFS-e: ${errorMessage}` },
        { status: 500 }
      )
    }
  }
)
