import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  calculateRepasse,
  calculateRepasseSummary,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  resolveAttendingProfId,
  type RepasseInvoiceLine,
  type InvoiceItemForRepasse,
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

    // Query all non-credit invoice items where this professional is the attending
    // (either explicitly set or as the invoice's professional when no attending is set)
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

    // Filter items where THIS professional is the attending
    const profItems = invoiceItems.filter(item => {
      const mapped: InvoiceItemForRepasse = {
        total: Number(item.total),
        attendingProfessionalId: item.attendingProfessionalId,
        invoiceProfessionalId: item.invoice.professionalProfileId,
        patientName: item.invoice.patient.name,
        invoiceId: item.invoice.id,
      }
      return resolveAttendingProfId(mapped) === professionalId
    })

    // Group by invoice for per-invoice breakdown
    const byInvoice = new Map<string, { patientName: string; total: number; count: number; hasSubstitute: boolean; invoiceProfId: string }>()
    for (const item of profItems) {
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

    // Get payment info
    const payment = await prisma.repassePayment.findUnique({
      where: {
        clinicId_professionalProfileId_referenceMonth_referenceYear: {
          clinicId: user.clinicId,
          professionalProfileId: professionalId,
          referenceMonth: month,
          referenceYear: year,
        },
      },
    })

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
