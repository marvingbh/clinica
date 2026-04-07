import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { buildNfseDescription } from "@/lib/nfse/description-builder"

/**
 * POST /api/financeiro/faturas/nfse-preview
 * Returns NFS-e description preview for filtered invoices.
 * Body: { month, year, invoiceIds?: string[] }
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const body = await req.json()
    const month = Number(body.month)
    const year = Number(body.year)
    const invoiceIds = body.invoiceIds as string[] | undefined

    if (!month || !year) {
      return NextResponse.json({ error: "Mês e ano são obrigatórios" }, { status: 400 })
    }

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      referenceMonth: month,
      referenceYear: year,
      status: { notIn: ["CANCELADO"] },
    }
    if (invoiceIds && invoiceIds.length > 0) {
      where.id = { in: invoiceIds }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: {
          select: {
            name: true, billingResponsibleName: true, billingCpf: true, cpf: true,
            sessionFee: true, nfseDescriptionTemplate: true, nfseObs: true,
          },
        },
        professionalProfile: {
          select: { registrationNumber: true, user: { select: { name: true } } },
        },
        clinic: { include: { nfseConfig: true } },
        items: {
          include: { appointment: { select: { scheduledAt: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ professionalProfile: { user: { name: "asc" } } }, { patient: { name: "asc" } }],
    })

    const nfseConfig = invoices[0]?.clinic?.nfseConfig

    const rows = invoices.map((inv) => {
      const sessionItems = inv.items.filter(i => i.type !== "CREDITO")
      const creditItems = inv.items.filter(i => i.type === "CREDITO")
      const sessionDates = sessionItems
        .filter(i => i.appointment?.scheduledAt)
        .map(i => new Date(i.appointment!.scheduledAt))

      const template = inv.patient.nfseDescriptionTemplate || nfseConfig?.descricaoServico || null

      const descricao = buildNfseDescription({
        patientName: inv.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
        billingResponsibleName: inv.patient.billingResponsibleName,
        professionalName: inv.professionalProfile.user.name,
        professionalCrp: inv.professionalProfile.registrationNumber || nfseConfig?.professionalCrp || undefined,
        referenceMonth: inv.referenceMonth,
        referenceYear: inv.referenceYear,
        sessionDates,
        sessionFee: Number(inv.patient.sessionFee || inv.totalAmount),
        totalAmount: Number(inv.totalAmount),
        taxPercentage: nfseConfig?.nfseTaxPercentage ? Number(nfseConfig.nfseTaxPercentage) : undefined,
      }, template)

      // Get day of week from first session
      const firstDate = sessionDates.length > 0 ? sessionDates.sort((a, b) => a.getTime() - b.getTime())[0] : null
      const dayOfWeek = firstDate ? firstDate.getDay() : null

      return {
        invoiceId: inv.id,
        patientName: inv.patient.name,
        professionalName: inv.professionalProfile.user.name,
        sessions: sessionItems.length,
        credits: creditItems.length,
        totalAmount: Number(inv.totalAmount),
        dueDate: inv.dueDate,
        status: inv.status,
        nfseStatus: inv.nfseStatus,
        nfseObs: inv.patient.nfseObs,
        responsavelNome: inv.patient.billingResponsibleName || inv.patient.name,
        responsavelCpf: inv.patient.billingCpf || inv.patient.cpf || null,
        dayOfWeek,
        descricao,
      }
    })

    // Sort by professional name, then day of week, then patient name
    rows.sort((a, b) => {
      const profCmp = a.professionalName.localeCompare(b.professionalName)
      if (profCmp !== 0) return profCmp
      const dayA = a.dayOfWeek ?? 7
      const dayB = b.dayOfWeek ?? 7
      if (dayA !== dayB) return dayA - dayB
      return a.patientName.localeCompare(b.patientName)
    })

    return NextResponse.json({ rows })
  }
)
