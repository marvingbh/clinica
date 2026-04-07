import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { buildNfseDescription } from "@/lib/nfse/description-builder"

/**
 * GET /api/financeiro/faturas/[id]/nfse/preview
 * Returns the auto-generated NFS-e description(s) for pre-filling the emission dialog.
 * Per-invoice mode: { descricao }
 * Per-item mode: { descricao, items: [{ invoiceItemId, date, valor, descricao }] }
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        patient: { select: { name: true, billingResponsibleName: true, nfseDescriptionTemplate: true, nfsePerAppointment: true, sessionFee: true } },
        professionalProfile: { select: { registrationNumber: true, user: { select: { name: true } } } },
        clinic: { include: { nfseConfig: true } },
        items: { include: { appointment: { select: { scheduledAt: true } } }, orderBy: { createdAt: "asc" } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    const nfseConfig = invoice.clinic.nfseConfig
    if (!nfseConfig) {
      return NextResponse.json({ descricao: "Servicos de saude" })
    }

    const template = invoice.patient.nfseDescriptionTemplate || nfseConfig.descricaoServico
    const baseParams = {
      patientName: invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
      billingResponsibleName: invoice.patient.billingResponsibleName,
      professionalName: invoice.professionalProfile.user.name,
      professionalCrp: invoice.professionalProfile.registrationNumber || nfseConfig.professionalCrp || undefined,
      referenceMonth: invoice.referenceMonth,
      referenceYear: invoice.referenceYear,
      taxPercentage: nfseConfig.nfseTaxPercentage ? Number(nfseConfig.nfseTaxPercentage) : undefined,
    }

    // All-sessions description (used for per-invoice mode and as fallback)
    const allSessionDates = invoice.items
      .filter(item => item.appointment?.scheduledAt && item.type !== "CREDITO")
      .map(item => new Date(item.appointment!.scheduledAt))

    const descricao = buildNfseDescription({
      ...baseParams,
      sessionDates: allSessionDates,
      sessionFee: Number(invoice.patient.sessionFee || invoice.totalAmount),
      totalAmount: Number(invoice.totalAmount),
    }, template)

    // Per-item mode: generate individual descriptions
    if (invoice.patient.nfsePerAppointment) {
      const items = invoice.items
        .filter(item => item.type !== "CREDITO")
        .map(item => {
          const sessionDate = item.appointment?.scheduledAt
            ? new Date(item.appointment.scheduledAt)
            : null

          const itemDescricao = sessionDate
            ? buildNfseDescription({
                ...baseParams,
                sessionDates: [sessionDate],
                sessionFee: Number(item.total),
              }, template)
            : `Servico de saude - ${item.description}`

          return {
            invoiceItemId: item.id,
            date: item.appointment?.scheduledAt || null,
            valor: Number(item.total),
            descricao: itemDescricao,
          }
        })

      return NextResponse.json({ descricao, items })
    }

    return NextResponse.json({ descricao })
  }
)
