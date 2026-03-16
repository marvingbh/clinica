import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { buildNfseDescription } from "@/lib/nfse/description-builder"

/**
 * GET /api/financeiro/faturas/[id]/nfse/preview
 * Returns the auto-generated NFS-e description for pre-filling the emission dialog.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        patient: { select: { name: true, billingResponsibleName: true, nfseDescriptionTemplate: true, sessionFee: true } },
        professionalProfile: { select: { user: { select: { name: true } } } },
        clinic: { include: { nfseConfig: true } },
        items: { include: { appointment: { select: { scheduledAt: true } } } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    const nfseConfig = invoice.clinic.nfseConfig
    if (!nfseConfig) {
      return NextResponse.json({ descricao: "Servicos de saude" })
    }

    const sessionDates = invoice.items
      .filter(item => item.appointment?.scheduledAt)
      .map(item => new Date(item.appointment!.scheduledAt))

    const descricao = buildNfseDescription({
      patientName: invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
      billingResponsibleName: invoice.patient.billingResponsibleName,
      professionalName: invoice.professionalProfile.user.name,
      professionalCrp: nfseConfig.professionalCrp || undefined,
      referenceMonth: invoice.referenceMonth,
      referenceYear: invoice.referenceYear,
      sessionDates,
      sessionFee: Number(invoice.patient.sessionFee || invoice.totalAmount),
      taxPercentage: nfseConfig.nfseTaxPercentage ? Number(nfseConfig.nfseTaxPercentage) : undefined,
    }, invoice.patient.nfseDescriptionTemplate || nfseConfig.descricaoServico)

    return NextResponse.json({ descricao })
  }
)
