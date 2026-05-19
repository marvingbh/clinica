import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { BILLABLE_STATUSES } from "@/lib/financeiro/invoice-generator"
import { audit, AuditAction } from "@/lib/rbac/audit"
import type { AppointmentStatus } from "@prisma/client"

type InvoiceItemType = "SESSAO_REGULAR" | "SESSAO_EXTRA" | "SESSAO_GRUPO" | "REUNIAO_ESCOLA" | "CREDITO"

interface AppointmentForMatch {
  id: string
  scheduledAt: Date
  type: string
  status: string
  groupId: string | null
  sessionGroupId: string | null
  recurrenceId: string | null
}

/**
 * Returns true if `apt` is a plausible match for an orphan invoice item of the
 * given type. Conservative — refuses to match across appointment kinds (e.g.
 * never links a SESSAO_REGULAR item to a group session) so the wrong slot
 * doesn't get tagged with the wrong patient session.
 */
function matchesItemType(itemType: InvoiceItemType, apt: AppointmentForMatch): boolean {
  if (itemType === "REUNIAO_ESCOLA") return apt.type === "REUNIAO"
  if (apt.type !== "CONSULTA") return false
  const isGroup = apt.groupId !== null || apt.sessionGroupId !== null
  if (itemType === "SESSAO_GRUPO") return isGroup
  if (isGroup) return false
  // SESSAO_REGULAR / SESSAO_EXTRA both match individual CONSULTA appointments.
  return itemType === "SESSAO_REGULAR" || itemType === "SESSAO_EXTRA"
}

/**
 * POST /api/financeiro/faturas/[id]/relink-orphans
 *
 * Re-links InvoiceItem rows whose `appointmentId` is NULL to live billable
 * appointments for the invoice's patient within its reference month. Useful
 * when a recurrence finalize/edit deleted the original appointments (cascade
 * SetNull on InvoiceItem.appointmentId) and replacement appointments were
 * created afterwards — without this, the items have no date trail.
 *
 * Only touches `appointmentId` (and `attendingProfessionalId` if available)
 * — does NOT change totals, descriptions, or anything that would require
 * `INVOICE_RECALCULATED`. Works on PAID invoices because nothing financial
 * is altered.
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: {
        id: true,
        patientId: true,
        referenceMonth: true,
        referenceYear: true,
        items: {
          where: { appointmentId: null, type: { not: "CREDITO" } },
          select: { id: true, type: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }
    if (invoice.items.length === 0) {
      return NextResponse.json({ relinked: 0, message: "Nenhum item órfão na fatura" })
    }

    // Candidate appointments: same clinic + patient, billable status, in the
    // invoice's reference month, and NOT already linked to an InvoiceItem.
    const monthStart = new Date(invoice.referenceYear, invoice.referenceMonth - 1, 1)
    const monthEnd = new Date(invoice.referenceYear, invoice.referenceMonth, 1)
    const candidates = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId: invoice.patientId,
        scheduledAt: { gte: monthStart, lt: monthEnd },
        status: { in: BILLABLE_STATUSES as AppointmentStatus[] },
        invoiceItems: { none: {} },
      },
      select: {
        id: true,
        scheduledAt: true,
        type: true,
        status: true,
        groupId: true,
        sessionGroupId: true,
        recurrenceId: true,
        attendingProfessionalId: true,
      },
      orderBy: { scheduledAt: "asc" },
    })

    // Greedy match: walk orphan items in createdAt order, pair each with the
    // earliest still-unused candidate that matches its type.
    const used = new Set<string>()
    const links: Array<{ itemId: string; appointmentId: string; attendingProfessionalId: string | null }> = []
    for (const item of invoice.items) {
      const apt = candidates.find(
        (c) => !used.has(c.id) && matchesItemType(item.type as InvoiceItemType, c),
      )
      if (apt) {
        used.add(apt.id)
        links.push({
          itemId: item.id,
          appointmentId: apt.id,
          attendingProfessionalId: apt.attendingProfessionalId,
        })
      }
    }

    if (links.length === 0) {
      return NextResponse.json({
        relinked: 0,
        message: "Nenhum agendamento elegível encontrado para vincular",
      })
    }

    await prisma.$transaction(
      links.map((l) =>
        prisma.invoiceItem.update({
          where: { id: l.itemId },
          data: {
            appointmentId: l.appointmentId,
            ...(l.attendingProfessionalId
              ? { attendingProfessionalId: l.attendingProfessionalId }
              : {}),
          },
        }),
      ),
    )

    audit.log({
      user,
      action: AuditAction.INVOICE_ITEMS_RELINKED,
      entityType: "Invoice",
      entityId: params.id,
      newValues: { links },
      request: req,
    }).catch(() => {})

    return NextResponse.json({
      relinked: links.length,
      orphansRemaining: invoice.items.length - links.length,
    })
  },
)
