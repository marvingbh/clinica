import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

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

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        referenceMonth: true,
        status: true,
        totalAmount: true,
        totalSessions: true,
        creditsApplied: true,
        extrasAdded: true,
        professionalProfileId: true,
        professionalProfile: { select: { user: { select: { name: true } } } },
        patientId: true,
      },
    })

    // Year totals
    let totalFaturado = 0
    let totalPendente = 0
    let totalEnviado = 0
    let totalPago = 0
    let totalSessions = 0
    let totalCredits = 0
    let totalExtras = 0
    let invoiceCount = 0
    let pendingCount = 0
    let enviadoCount = 0
    let paidCount = 0

    // By month
    const byMonth: Record<number, {
      faturado: number; pendente: number; enviado: number; pago: number
      sessions: number; credits: number; extras: number
      invoiceCount: number; pendingCount: number; enviadoCount: number; paidCount: number
    }> = {}

    // By professional
    const byProfessional: Record<string, {
      name: string
      faturado: number; pendente: number; enviado: number; pago: number
      sessions: number; invoiceCount: number; patientIds: Set<string>
    }> = {}

    for (const inv of invoices) {
      const amount = Number(inv.totalAmount)
      const isPendente = inv.status === "PENDENTE"
      const isEnviado = inv.status === "ENVIADO"
      const isPago = inv.status === "PAGO"

      totalFaturado += amount
      totalSessions += inv.totalSessions
      totalCredits += inv.creditsApplied
      totalExtras += inv.extrasAdded
      invoiceCount++
      if (isPendente) { totalPendente += amount; pendingCount++ }
      if (isEnviado) { totalEnviado += amount; enviadoCount++ }
      if (isPago) { totalPago += amount; paidCount++ }

      // By month
      const m = inv.referenceMonth
      if (!byMonth[m]) {
        byMonth[m] = { faturado: 0, pendente: 0, enviado: 0, pago: 0, sessions: 0, credits: 0, extras: 0, invoiceCount: 0, pendingCount: 0, enviadoCount: 0, paidCount: 0 }
      }
      byMonth[m].faturado += amount
      byMonth[m].sessions += inv.totalSessions
      byMonth[m].credits += inv.creditsApplied
      byMonth[m].extras += inv.extrasAdded
      byMonth[m].invoiceCount++
      if (isPendente) { byMonth[m].pendente += amount; byMonth[m].pendingCount++ }
      if (isEnviado) { byMonth[m].enviado += amount; byMonth[m].enviadoCount++ }
      if (isPago) { byMonth[m].pago += amount; byMonth[m].paidCount++ }

      // By professional
      const profId = inv.professionalProfileId
      if (!byProfessional[profId]) {
        byProfessional[profId] = {
          name: inv.professionalProfile.user.name,
          faturado: 0, pendente: 0, enviado: 0, pago: 0,
          sessions: 0, invoiceCount: 0, patientIds: new Set(),
        }
      }
      byProfessional[profId].faturado += amount
      byProfessional[profId].sessions += inv.totalSessions
      byProfessional[profId].invoiceCount++
      byProfessional[profId].patientIds.add(inv.patientId)
      if (isPendente) byProfessional[profId].pendente += amount
      if (isEnviado) byProfessional[profId].enviado += amount
      if (isPago) byProfessional[profId].pago += amount
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

    // Serialize byProfessional (convert Set to count)
    const byProfessionalSerialized = Object.entries(byProfessional).map(([id, p]) => ({
      id,
      name: p.name,
      faturado: p.faturado,
      pendente: p.pendente,
      enviado: p.enviado,
      pago: p.pago,
      sessions: p.sessions,
      invoiceCount: p.invoiceCount,
      patientCount: p.patientIds.size,
    })).sort((a, b) => b.faturado - a.faturado)

    return NextResponse.json({
      year,
      month,
      totalFaturado,
      totalPendente,
      totalEnviado,
      totalPago,
      totalSessions,
      totalCredits,
      totalExtras,
      invoiceCount,
      pendingCount,
      enviadoCount,
      paidCount,
      availableCredits,
      byMonth,
      byProfessional: byProfessionalSerialized,
    })
  }
)
