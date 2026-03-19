import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  calculateRepasse,
  calculateRepasseSummary,
  REPASSE_BILLABLE_INVOICE_STATUSES,
  type RepasseInvoiceLine,
} from "@/lib/financeiro/repasse"
import { audit, AuditAction } from "@/lib/rbac/audit"

const paySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  notes: z.string().max(500).optional(),
})

/**
 * POST /api/financeiro/repasse/[professionalId]/pay
 * Creates or updates a RepassePayment record for the given month.
 * Calculates the current repasse amount and saves it as a snapshot.
 * Only ADMIN users can mark repasse payments.
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const professionalId = params.professionalId

    // Only admins can mark repasse payments
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Apenas administradores podem registrar pagamentos de repasse" }, { status: 403 })
    }

    const body = await req.json()
    const parsed = paySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { year, month, notes } = parsed.data

    // Verify professional belongs to clinic
    const professional = await prisma.professionalProfile.findFirst({
      where: { id: professionalId, user: { clinicId: user.clinicId } },
      select: { id: true, repassePercentage: true },
    })
    if (!professional) {
      return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 })
    }

    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: user.clinicId },
      select: { taxPercentage: true },
    })
    const taxPercent = Number(clinic.taxPercentage)
    const repassePercent = Number(professional.repassePercentage)

    // Calculate + upsert in a transaction for snapshot consistency
    let payment
    try {
    payment = await prisma.$transaction(async (tx) => {
      const invoiceItems = await tx.invoiceItem.findMany({
        where: {
          invoice: {
            clinicId: user.clinicId,
            referenceYear: year,
            referenceMonth: month,
            status: { in: [...REPASSE_BILLABLE_INVOICE_STATUSES] },
          },
          type: { not: "CREDITO" },
          OR: [
            { attendingProfessionalId: professionalId },
            { attendingProfessionalId: null, invoice: { professionalProfileId: professionalId } },
          ],
        },
        select: {
          total: true,
          invoice: { select: { id: true } },
        },
      })

      // Aggregate by invoice for summary
      const byInvoice = new Map<string, { total: number; count: number }>()
      for (const item of invoiceItems) {
        const existing = byInvoice.get(item.invoice.id)
        if (existing) {
          existing.total += Number(item.total)
          existing.count++
        } else {
          byInvoice.set(item.invoice.id, { total: Number(item.total), count: 1 })
        }
      }

      const lines: RepasseInvoiceLine[] = []
      for (const [invoiceId, data] of byInvoice) {
        const calc = calculateRepasse(data.total, taxPercent, repassePercent)
        lines.push({ ...calc, invoiceId, patientName: "", totalSessions: data.count })
      }
      const summary = calculateRepasseSummary(lines)

      const grossAmount = summary.totalGross
      const taxAmount = summary.totalTax
      const repasseAmount = summary.totalRepasse

      // Reject zero-amount payments
      if (grossAmount === 0 && repasseAmount === 0) {
        throw new Error("ZERO_AMOUNT")
      }

      return tx.repassePayment.upsert({
        where: {
          clinicId_professionalProfileId_referenceMonth_referenceYear: {
            clinicId: user.clinicId,
            professionalProfileId: professionalId,
            referenceMonth: month,
            referenceYear: year,
          },
        },
        create: {
          clinicId: user.clinicId,
          professionalProfileId: professionalId,
          referenceMonth: month,
          referenceYear: year,
          grossAmount,
          taxAmount,
          repasseAmount,
          notes: notes ?? null,
        },
        update: {
          grossAmount,
          taxAmount,
          repasseAmount,
          paidAt: new Date(),
          notes: notes ?? null,
        },
      })
    })
    } catch (error) {
      if (error instanceof Error && error.message === "ZERO_AMOUNT") {
        return NextResponse.json({ error: "Nenhum valor de repasse para este período" }, { status: 400 })
      }
      throw error
    }

    // Audit log
    await audit.log({
      user,
      action: AuditAction.REPASSE_PAYMENT_CREATED,
      entityType: "RepassePayment",
      entityId: payment.id,
      newValues: {
        professionalProfileId: professionalId,
        referenceMonth: month,
        referenceYear: year,
        grossAmount: Number(payment.grossAmount),
        taxAmount: Number(payment.taxAmount),
        repasseAmount: Number(payment.repasseAmount),
      },
      request: req,
    })

    return NextResponse.json({
      payment: {
        id: payment.id,
        grossAmount: Number(payment.grossAmount),
        taxAmount: Number(payment.taxAmount),
        repasseAmount: Number(payment.repasseAmount),
        paidAt: payment.paidAt.toISOString(),
        notes: payment.notes,
      },
    })
  }
)

/**
 * DELETE /api/financeiro/repasse/[professionalId]/pay
 * Removes a RepassePayment record (undo payment).
 * Only ADMIN users can undo repasse payments.
 */
export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const professionalId = params.professionalId

    // Only admins can undo repasse payments
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Apenas administradores podem desfazer pagamentos de repasse" }, { status: 403 })
    }

    const url = new URL(req.url)
    const yearParam = url.searchParams.get("year")
    const monthParam = url.searchParams.get("month")

    if (!yearParam || !monthParam) {
      return NextResponse.json({ error: "year and month are required" }, { status: 400 })
    }

    const year = parseInt(yearParam)
    const month = parseInt(monthParam)

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "year and month must be valid integers" }, { status: 400 })
    }

    try {
      const deleted = await prisma.repassePayment.delete({
        where: {
          clinicId_professionalProfileId_referenceMonth_referenceYear: {
            clinicId: user.clinicId,
            professionalProfileId: professionalId,
            referenceMonth: month,
            referenceYear: year,
          },
        },
      })

      // Audit log
      await audit.log({
        user,
        action: AuditAction.REPASSE_PAYMENT_DELETED,
        entityType: "RepassePayment",
        entityId: deleted.id,
        oldValues: {
          professionalProfileId: professionalId,
          referenceMonth: month,
          referenceYear: year,
          grossAmount: Number(deleted.grossAmount),
          taxAmount: Number(deleted.taxAmount),
          repasseAmount: Number(deleted.repasseAmount),
        },
        request: req,
      })
    } catch {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  }
)
