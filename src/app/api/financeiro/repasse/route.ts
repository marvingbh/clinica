import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  buildRepasseFromInvoices,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  type InvoiceBreakdownInput,
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
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "year and month must be valid integers" }, { status: 400 })
    }
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

    // For "own" scope, include any invoice this prof touched (as owner or as
    // attending on at least one item).
    const baseInvoiceWhere = {
      clinicId: user.clinicId,
      referenceYear: year,
      referenceMonth: month,
      status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
    }
    const invoiceWhere =
      scope === "own" && user.professionalProfileId
        ? {
            ...baseInvoiceWhere,
            OR: [
              { professionalProfileId: user.professionalProfileId },
              { items: { some: { attendingProfessionalId: user.professionalProfileId } } },
            ],
          }
        : baseInvoiceWhere

    const [rawInvoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          professionalProfileId: true,
          totalAmount: true,
          totalSessions: true,
          patient: { select: { name: true } },
          items: {
            select: {
              type: true,
              total: true,
              attendingProfessionalId: true,
            },
          },
          consumedCredits: {
            select: { professionalProfileId: true },
          },
        },
      }),
      prisma.repassePayment.findMany({
        where: {
          clinicId: user.clinicId,
          referenceYear: year,
          referenceMonth: month,
        },
      }),
    ])

    const invoices: InvoiceBreakdownInput[] = rawInvoices.map((inv) => ({
      invoiceId: inv.id,
      invoiceProfessionalId: inv.professionalProfileId,
      patientName: inv.patient.name,
      invoiceTotalAmount: Number(inv.totalAmount),
      invoiceTotalSessions: inv.totalSessions,
      items: inv.items.map((it) => ({
        total: Number(it.total),
        isCredit: it.type === "CREDITO",
        attendingProfessionalId: it.attendingProfessionalId,
      })),
      creditOriginatingProfessionalIds: inv.consumedCredits.map((c) => c.professionalProfileId),
    }))

    const invoiceIds = invoices.map((i) => i.invoiceId)
    const reconciled = invoiceIds.length
      ? await prisma.reconciliationLink.groupBy({
          by: ["invoiceId"],
          where: { invoiceId: { in: invoiceIds } },
          _sum: { amount: true },
        })
      : []
    const invoicePaidAmounts = new Map(
      reconciled.map((r) => [r.invoiceId, Number(r._sum.amount ?? 0)]),
    )

    const profMap = new Map(
      professionals.map(p => [p.id, { repassePercent: Number(p.repassePercentage) }])
    )

    const repasseByProf = buildRepasseFromInvoices(invoices, profMap, taxPercent, invoicePaidAmounts)
    const paymentMap = new Map(payments.map(p => [p.professionalProfileId, p]))

    const result = professionals.map((prof) => {
      const repasseData = repasseByProf.get(prof.id)
      const summary = repasseData?.summary ?? {
        totalInvoices: 0, totalSessions: 0, totalGross: 0,
        totalTax: 0, totalAfterTax: 0, totalRepasse: 0,
        totalReceived: 0, percentReceived: 0,
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
