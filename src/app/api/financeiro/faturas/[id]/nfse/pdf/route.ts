import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { fetchDanfse, type AdnConfig } from "@/lib/nfse/adn-client"

/**
 * GET /api/financeiro/faturas/[id]/nfse/pdf
 * Downloads the official DANFSE PDF from the ADN.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        patient: { select: { name: true } },
        clinic: { include: { nfseConfig: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    if (invoice.nfseStatus !== "EMITIDA" || !invoice.nfseChaveAcesso) {
      return NextResponse.json({ error: "NFS-e nao emitida para esta fatura" }, { status: 400 })
    }

    const nfseConfig = invoice.clinic.nfseConfig
    if (!nfseConfig) {
      return NextResponse.json({ error: "Configuracao NFS-e nao encontrada" }, { status: 400 })
    }

    try {
      const adnConfig: AdnConfig = {
        clinicId: user.clinicId,
        invoiceId: invoice.id,
        certificatePem: nfseConfig.certificatePem,
        privateKeyPem: nfseConfig.privateKeyPem,
        useSandbox: nfseConfig.useSandbox,
      }

      const pdfBuffer = await fetchDanfse(invoice.nfseChaveAcesso, adnConfig)

      const patientName = invoice.patient.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
      const filename = `NFS-e-${invoice.nfseNumero || "sem-numero"}-${patientName}.pdf`

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido"
      const isAdnUnavailable = msg.includes("502") || msg.includes("503") || msg.includes("504")
      return NextResponse.json(
        { error: isAdnUnavailable
          ? "O servidor do ADN esta temporariamente indisponivel para gerar o PDF. Tente novamente em alguns minutos."
          : `Erro ao baixar DANFSE: ${msg}` },
        { status: isAdnUnavailable ? 503 : 500 }
      )
    }
  }
)
