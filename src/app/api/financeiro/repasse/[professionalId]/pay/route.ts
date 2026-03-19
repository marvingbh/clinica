import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  buildRepasseByAttendingProfessional,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  type InvoiceItemForRepasse,
} from "@/lib/financeiro/repasse"

const paySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  notes: z.string().max(500).optional(),
})

/**
 * POST /api/financeiro/repasse/[professionalId]/pay
 * Creates or updates a RepassePayment record for the given month.
 * Calculates the current repasse amount and saves it as a snapshot.
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const professionalId = params.professionalId

    const body = await req.json()
    const parsed = paySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { year, month, notes } = parsed.data

    // Verify professional belongs to clinic
    const professional = await prisma.professionalProfile.findFirst({
      where: { id: professionalId, user: { clinicId: user.clinicId } },
      select: { id: true, repassePercentage: true },
    })
    if (!professional) {
      return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 })
    }

    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: user.clinicId },
      select: { taxPercentage: true },
    })
    const taxPercent = Number(clinic.taxPercentage)
    const repassePercent = Number(professional.repassePercentage)

    // Calculate current repasse for this professional
    const invoiceItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          clinicId: user.clinicId,
          referenceYear: year,
          referenceMonth: month,
          status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
        },
        type: { not: "CREDITO" },
      },
      select: {
        total: true,
        attendingProfessionalId: true,
        invoice: {
          select: {
            id: true,
            professionalProfileId: true,
            patient: { select: { name: true } },
          },
        },
      },
    })

    const items: InvoiceItemForRepasse[] = invoiceItems.map(item => ({
      total: Number(item.total),
      attendingProfessionalId: item.attendingProfessionalId,
      invoiceProfessionalId: item.invoice.professionalProfileId,
      patientName: item.invoice.patient.name,
      invoiceId: item.invoice.id,
    }))

    const profMap = new Map([[professionalId, { repassePercent }]])
    const repasseByProf = buildRepasseByAttendingProfessional(items, profMap, taxPercent)
    const profData = repasseByProf.get(professionalId)

    const grossAmount = profData?.summary.totalGross ?? 0
    const taxAmount = profData?.summary.totalTax ?? 0
    const repasseAmount = profData?.summary.totalRepasse ?? 0

    // Upsert the payment record
    const payment = await prisma.repassePayment.upsert({
      where: {
        clinicId_professionalProfileId_referenceMonth_referenceYear: {
          clinicId: user.clinicId,
          professionalProfileId: professionalId,
          referenceMonth: month,
          referenceYear: year,
        },
      },
      create: {
        clinicId: user.clinicId,
        professionalProfileId: professionalId,
        referenceMonth: month,
        referenceYear: year,
        grossAmount,
        taxAmount,
        repasseAmount,
        notes: notes ?? null,
      },
      update: {
        grossAmount,
        taxAmount,
        repasseAmount,
        paidAt: new Date(),
        notes: notes ?? null,
      },
    })

    return NextResponse.json({
      payment: {
        id: payment.id,
        grossAmount: Number(payment.grossAmount),
        taxAmount: Number(payment.taxAmount),
        repasseAmount: Number(payment.repasseAmount),
        paidAt: payment.paidAt.toISOString(),
        notes: payment.notes,
      },
    })
  }
)

/**
 * DELETE /api/financeiro/repasse/[professionalId]/pay
 * Removes a RepassePayment record (undo payment).
 */
export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const professionalId = params.professionalId
    const url = new URL(req.url)
    const yearParam = url.searchParams.get("year")
    const monthParam = url.searchParams.get("month")

    if (!yearParam || !monthParam) {
      return NextResponse.json({ error: "year and month are required" }, { status: 400 })
    }

    const year = parseInt(yearParam)
    const month = parseInt(monthParam)

    try {
      await prisma.repassePayment.delete({
        where: {
          clinicId_professionalProfileId_referenceMonth_referenceYear: {
            clinicId: user.clinicId,
            professionalProfileId: professionalId,
            referenceMonth: month,
            referenceYear: year,
          },
        },
      })
    } catch {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  }
)
