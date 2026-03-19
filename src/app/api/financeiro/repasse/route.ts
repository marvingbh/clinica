import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  buildRepasseByAttendingProfessional,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  type InvoiceItemForRepasse,
} from "@/lib/financeiro/repasse"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const yearParam = url.searchParams.get("year")
    const monthParam = url.searchParams.get("month")

    if (!yearParam || !monthParam) {
      return NextResponse.json(
        { error: "year and month are required" },
        { status: 400 }
      )
    }

    const year = parseInt(yearParam)
    const month = parseInt(monthParam)
    const scope = user.role === "ADMIN" ? "clinic" : "own"

    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: user.clinicId },
      select: { taxPercentage: true },
    })
    const taxPercent = Number(clinic.taxPercentage)

    const profWhere =
      scope === "own" && user.professionalProfileId
        ? { id: user.professionalProfileId }
        : {}

    const professionals = await prisma.professionalProfile.findMany({
      where: { ...profWhere, user: { clinicId: user.clinicId } },
      select: {
        id: true,
        repassePercentage: true,
        user: { select: { name: true } },
      },
    })

    // Query invoice items for the month (with parent invoice info + attending professional)
    const invoiceItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          clinicId: user.clinicId,
          referenceYear: year,
          referenceMonth: month,
          status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
          ...(scope === "own" && user.professionalProfileId
            ? { professionalProfileId: user.professionalProfileId }
            : {}),
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

    // Build items for repasse calculation
    const items: InvoiceItemForRepasse[] = invoiceItems.map(item => ({
      total: Number(item.total),
      attendingProfessionalId: item.attendingProfessionalId,
      invoiceProfessionalId: item.invoice.professionalProfileId,
      patientName: item.invoice.patient.name,
      invoiceId: item.invoice.id,
    }))

    // Build professional map
    const profMap = new Map(
      professionals.map(p => [p.id, { repassePercent: Number(p.repassePercentage) }])
    )

    const repasseByProf = buildRepasseByAttendingProfessional(items, profMap, taxPercent)

    // Query repasse payments for the month
    const payments = await prisma.repassePayment.findMany({
      where: {
        clinicId: user.clinicId,
        referenceYear: year,
        referenceMonth: month,
      },
    })
    const paymentMap = new Map(payments.map(p => [p.professionalProfileId, p]))

    const result = professionals.map((prof) => {
      const repasseData = repasseByProf.get(prof.id)
      const summary = repasseData?.summary ?? {
        totalInvoices: 0, totalSessions: 0, totalGross: 0,
        totalTax: 0, totalAfterTax: 0, totalRepasse: 0,
      }
      const payment = paymentMap.get(prof.id)

      return {
        professionalId: prof.id,
        name: prof.user.name,
        repassePercent: Number(prof.repassePercentage),
        taxPercent,
        ...summary,
        paidAmount: payment ? Number(payment.repasseAmount) : null,
        paidAt: payment?.paidAt?.toISOString() ?? null,
        adjustment: payment ? Math.round((summary.totalRepasse - Number(payment.repasseAmount)) * 100) / 100 : 0,
      }
    })

    return NextResponse.json({ year, month, taxPercent, professionals: result })
  }
)
