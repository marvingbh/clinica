import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  buildRepasseFromInvoices,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  type InvoiceBreakdownInput,
  type RepasseInvoiceLine,
} from "@/lib/financeiro/repasse"
import { buildInvoiceSlotMap, compareSlots, type InvoiceSlot, type SlotItemInput } from "@/lib/financeiro/invoice-slot"

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
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "year and month must be valid integers" }, { status: 400 })
    }

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

    // Include any invoice this prof touched — as owner or as attending on
    // at least one item (covers patients whose reference prof is someone else).
    const [rawInvoices, payment] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          referenceYear: year,
          referenceMonth: month,
          status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
          OR: [
            { professionalProfileId: professionalId },
            { items: { some: { attendingProfessionalId: professionalId } } },
          ],
        },
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
              appointment: {
                select: {
                  scheduledAt: true,
                  recurrence: { select: { dayOfWeek: true, startTime: true } },
                },
              },
            },
          },
          consumedCredits: {
            select: { professionalProfileId: true },
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

    const profMap = new Map([[professionalId, { repassePercent }]])
    const built = buildRepasseFromInvoices(invoices, profMap, taxPercent, invoicePaidAmounts)
    const repasseData = built.get(professionalId)
    const rawLines = repasseData?.lines ?? []

    const slotInputs: SlotItemInput[] = []
    for (const inv of rawInvoices) {
      for (const item of inv.items) {
        slotInputs.push({ invoiceId: inv.id, appointment: item.appointment })
      }
    }
    const slotMap = buildInvoiceSlotMap(slotInputs)

    const lines: (RepasseInvoiceLine & { slot: InvoiceSlot | null })[] = rawLines
      .map((line) => ({
        ...line,
        slot: slotMap.get(line.invoiceId) ?? null,
      }))
      .sort((a, b) => compareSlots(a.slot, b.slot))

    const summary = repasseData?.summary ?? {
      totalInvoices: 0, totalSessions: 0, totalGross: 0,
      totalTax: 0, totalAfterTax: 0, totalRepasse: 0,
      totalReceived: 0, percentReceived: 0,
    }

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
