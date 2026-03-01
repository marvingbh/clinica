import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { pickEarliestRecurrence, sortInvoicesByRecurrence } from "@/lib/financeiro/invoice-sort"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const url = new URL(req.url)
    const month = url.searchParams.get("month") ? parseInt(url.searchParams.get("month")!) : undefined
    const year = url.searchParams.get("year") ? parseInt(url.searchParams.get("year")!) : undefined
    const status = url.searchParams.get("status") || undefined
    const professionalId = url.searchParams.get("professionalId") || undefined
    const patientId = url.searchParams.get("patientId") || undefined
    const patientSearch = url.searchParams.get("patientSearch") || undefined
    const sortBy = url.searchParams.get("sortBy") || "name"

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (professionalId) {
      where.professionalProfileId = professionalId
    }

    if (month) where.referenceMonth = month
    if (year) where.referenceYear = year
    if (status) where.status = status
    if (patientId) where.patientId = patientId
    if (patientSearch) {
      where.patient = { name: { contains: patientSearch, mode: "insensitive" } }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true } },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: [{ patient: { name: "asc" } }, { referenceYear: "desc" }, { referenceMonth: "desc" }],
    })

    let result = invoices.map(({ notaFiscalPdf, ...inv }) => ({
      ...inv,
      hasNotaFiscalPdf: !!notaFiscalPdf,
    }))

    if (sortBy === "recurrence" && result.length > 0) {
      const patientIds = [...new Set(result.map(i => i.patientId))]
      const recurrences = await prisma.appointmentRecurrence.findMany({
        where: { clinicId: user.clinicId, patientId: { in: patientIds }, isActive: true },
        select: { patientId: true, dayOfWeek: true, startTime: true },
      })

      const byPatient = new Map<string, { dayOfWeek: number; startTime: string }[]>()
      for (const r of recurrences) {
        if (!r.patientId) continue
        const list = byPatient.get(r.patientId) || []
        list.push({ dayOfWeek: r.dayOfWeek, startTime: r.startTime })
        byPatient.set(r.patientId, list)
      }

      const recurrenceMap = new Map<string, { dayOfWeek: number; startTime: string }>()
      for (const [pid, recs] of byPatient) {
        const earliest = pickEarliestRecurrence(recs)
        if (earliest) recurrenceMap.set(pid, earliest)
      }

      result = sortInvoicesByRecurrence(result, recurrenceMap)
    }

    return NextResponse.json(result)
  }
)
