import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { deriveGroupStatus } from "@/lib/financeiro/invoice-grouping"
import {
  applyDerivedGroupStatus,
  aggregateInvoiceTotals,
  groupByMonth,
  groupByProfessional,
  buildPaymentsByDay,
} from "@/lib/financeiro/dashboard-aggregation"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()))
    const month = url.searchParams.get("month") ? parseInt(url.searchParams.get("month")!) : null

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      referenceYear: year,
    }
    if (month) where.referenceMonth = month
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    }

    const rawInvoices = await prisma.invoice.findMany({
      where,
      select: {
        referenceMonth: true,
        referenceYear: true,
        status: true,
        totalAmount: true,
        totalSessions: true,
        creditsApplied: true,
        extrasAdded: true,
        invoiceType: true,
        professionalProfileId: true,
        professionalProfile: { select: { user: { select: { name: true } } } },
        patientId: true,
      },
    })

    const invoices = applyDerivedGroupStatus(rawInvoices, deriveGroupStatus)
    const totals = aggregateInvoiceTotals(invoices)
    const byMonth = groupByMonth(invoices)
    const byProfessional = groupByProfessional(invoices)

    // Payments by day (only when a specific month is selected)
    let paymentsByDay: { day: number; amount: number; count: number }[] = []
    if (month) {
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          paidAt: {
            gte: new Date(year, month - 1, 1),
            lt: new Date(year, month, 1),
          },
          status: { not: "CANCELADO" },
          ...(scope === "own" && user.professionalProfileId
            ? { professionalProfileId: user.professionalProfileId }
            : {}),
        },
        select: { paidAt: true, totalAmount: true },
      })

      const daysInMonth = new Date(year, month, 0).getDate()
      paymentsByDay = buildPaymentsByDay(paidInvoices, daysInMonth)
    }

    // Available credits
    const creditWhere: Record<string, unknown> = {
      clinicId: user.clinicId,
      consumedByInvoiceId: null,
    }
    if (scope === "own" && user.professionalProfileId) {
      creditWhere.professionalProfileId = user.professionalProfileId
    }
    const availableCredits = await prisma.sessionCredit.count({ where: creditWhere })

    return NextResponse.json({
      year,
      month,
      ...totals,
      availableCredits,
      byMonth,
      byProfessional,
      paymentsByDay,
    })
  }
)
