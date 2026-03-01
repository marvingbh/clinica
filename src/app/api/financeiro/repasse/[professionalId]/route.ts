import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  buildRepasseFromInvoices,
  calculateRepasseSummary,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  type InvoiceForRepasse,
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

    const invoices = await prisma.invoice.findMany({
      where: {
        clinicId: user.clinicId,
        professionalProfileId: professionalId,
        referenceYear: year,
        referenceMonth: month,
        status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
      },
      select: {
        id: true,
        totalAmount: true,
        totalSessions: true,
        patient: { select: { name: true } },
      },
      orderBy: { patient: { name: "asc" } },
    })

    const mapped: InvoiceForRepasse[] = invoices.map((inv) => ({
      invoiceId: inv.id,
      patientName: inv.patient.name,
      totalSessions: inv.totalSessions,
      totalAmount: Number(inv.totalAmount),
    }))

    const lines = buildRepasseFromInvoices(mapped, taxPercent, repassePercent)
    const summary = calculateRepasseSummary(lines)

    return NextResponse.json({
      year,
      month,
      taxPercent,
      repassePercent,
      professional: { id: professional.id, name: professional.user.name },
      summary,
      items: lines,
    })
  }
)
