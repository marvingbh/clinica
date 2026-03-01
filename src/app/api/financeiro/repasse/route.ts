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

    const invoices = await prisma.invoice.findMany({
      where: {
        clinicId: user.clinicId,
        referenceYear: year,
        referenceMonth: month,
        status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      select: {
        id: true,
        professionalProfileId: true,
        totalAmount: true,
        totalSessions: true,
        patient: { select: { name: true } },
      },
    })

    const result = professionals.map((prof) => {
      const profInvoices = invoices.filter(
        (inv) => inv.professionalProfileId === prof.id
      )

      const mapped: InvoiceForRepasse[] = profInvoices.map((inv) => ({
        invoiceId: inv.id,
        patientName: inv.patient.name,
        totalSessions: inv.totalSessions,
        totalAmount: Number(inv.totalAmount),
      }))

      const repassePercent = Number(prof.repassePercentage)
      const lines = buildRepasseFromInvoices(mapped, taxPercent, repassePercent)
      const summary = calculateRepasseSummary(lines)

      return {
        professionalId: prof.id,
        name: prof.user.name,
        repassePercent,
        taxPercent,
        ...summary,
      }
    })

    return NextResponse.json({ year, month, taxPercent, professionals: result })
  }
)
