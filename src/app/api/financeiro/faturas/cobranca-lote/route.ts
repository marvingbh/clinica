import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { createChargeForInvoice, ChargeError } from "@/lib/cobranca/charge-service"
import { sendChargeNotifications } from "@/lib/cobranca/charge-notify"

const schema = z.object({
  invoiceIds: z.array(z.string()).min(1).max(50),
  channels: z.array(z.enum(["WHATSAPP", "EMAIL"])).optional(),
})

/**
 * POST /api/financeiro/faturas/cobranca-lote
 * Creates one charge per invoice. Validates ALL invoices belong to the
 * tenant before processing; per-invoice failures are reported in `skipped`.
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { invoiceIds, channels } = parsed.data
    const uniqueIds = [...new Set(invoiceIds)]

    const found = await prisma.invoice.findMany({
      where: { id: { in: uniqueIds }, clinicId: user.clinicId },
      select: { id: true },
    })
    if (found.length !== uniqueIds.length) {
      return NextResponse.json({ error: "Uma ou mais faturas não pertencem à clínica" }, { status: 404 })
    }

    const created: string[] = []
    const skipped: Array<{ invoiceId: string; reason: string }> = []

    for (const invoiceId of uniqueIds) {
      try {
        const { charge } = await createChargeForInvoice({
          invoiceId,
          clinicId: user.clinicId,
          createdByUserId: user.id,
        })
        if (channels && channels.length > 0) {
          await sendChargeNotifications({ chargeId: charge.id, channels, type: "PAYMENT_LINK" })
        }
        await audit.log({
          user,
          action: AuditAction.PAYMENT_CHARGE_CREATED,
          entityType: "PaymentCharge",
          entityId: charge.id,
          newValues: { invoiceId, amount: charge.amount, lote: true },
          request: req,
        })
        created.push(invoiceId)
      } catch (err) {
        const reason = err instanceof ChargeError ? err.message : "Erro ao cobrar"
        skipped.push({ invoiceId, reason })
      }
    }

    return NextResponse.json({ created: created.length, createdIds: created, skipped })
  }
)
