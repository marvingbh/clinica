import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  calculateRepasse,
  calculateRepasseSummary,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  type RepasseInvoiceLine,
} from "@/lib/financeiro/repasse"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const professionalId = params.professionalId
    const scope = user.role === "ADMIN" ? "clinic" : "own"

    if (scope === "own" && user.professionalProfileId !== professionalId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

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

    const professional = await prisma.professionalProfile.findFirst({
      where: { id: professionalId, user: { clinicId: user.clinicId } },
      select: {
        id: true,
        repassePercentage: true,
        user: { select: { name: true } },
      },
    })

    if (!professional) {
      return NextResponse.json(
        { error: "Profissional não encontrado" },
        { status: 404 }
      )
    }

    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: user.clinicId },
      select: { taxPercentage: true },
    })
    const taxPercent = Number(clinic.taxPercentage)
    const repassePercent = Number(professional.repassePercentage)

    const invoiceWhere = {
      clinicId: user.clinicId,
      referenceYear: year,
      referenceMonth: month,
      status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
    }

    // Query only items where this professional is the attending
    // (explicitly set, or fallback when attendingProfessionalId is null)
    const [invoiceItems, payment] = await Promise.all([
      prisma.invoiceItem.findMany({
        where: {
          invoice: invoiceWhere,
          type: { not: "CREDITO" },
          OR: [
            { attendingProfessionalId: professionalId },
            { attendingProfessionalId: null, invoice: { professionalProfileId: professionalId } },
          ],
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
      }),
      prisma.repassePayment.findUnique({
        where: {
          clinicId_professionalProfileId_referenceMonth_referenceYear: {
            clinicId: user.clinicId,
            professionalProfileId: professionalId,
            referenceMonth: month,
            referenceYear: year,
          },
        },
      }),
    ])

    // Group by invoice for per-invoice breakdown
    const byInvoice = new Map<string, { patientName: string; total: number; count: number; hasSubstitute: boolean; invoiceProfId: string }>()
    for (const item of invoiceItems) {
      const invoiceId = item.invoice.id
      const existing = byInvoice.get(invoiceId)
      const isSubstitute = item.attendingProfessionalId !== null && item.attendingProfessionalId !== item.invoice.professionalProfileId
      if (existing) {
        existing.total += Number(item.total)
        existing.count++
        if (isSubstitute) existing.hasSubstitute = true
      } else {
        byInvoice.set(invoiceId, {
          patientName: item.invoice.patient.name,
          total: Number(item.total),
          count: 1,
          hasSubstitute: isSubstitute,
          invoiceProfId: item.invoice.professionalProfileId,
        })
      }
    }

    const lines: (RepasseInvoiceLine & { note?: string })[] = []
    for (const [invoiceId, data] of byInvoice) {
      const calc = calculateRepasse(data.total, taxPercent, repassePercent)
      const note = data.hasSubstitute && data.invoiceProfId !== professionalId
        ? "Cobertura"
        : undefined
      lines.push({ ...calc, invoiceId, patientName: data.patientName, totalSessions: data.count, note })
    }

    const summary = calculateRepasseSummary(lines)

    return NextResponse.json({
      year,
      month,
      taxPercent,
      repassePercent,
      professional: { id: professional.id, name: professional.user.name },
      summary,
      items: lines,
      payment: payment ? {
        paidAmount: Number(payment.repasseAmount),
        grossAmount: Number(payment.grossAmount),
        taxAmount: Number(payment.taxAmount),
        paidAt: payment.paidAt.toISOString(),
        notes: payment.notes,
      } : null,
      adjustment: payment ? Math.round((summary.totalRepasse - Number(payment.repasseAmount)) * 100) / 100 : 0,
    })
  }
)
