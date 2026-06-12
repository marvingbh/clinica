import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { createChargeForInvoice, ChargeError } from "@/lib/cobranca/charge-service"
import { sendChargeNotifications } from "@/lib/cobranca/charge-notify"
import { buildPaymentLinkUrl } from "@/lib/cobranca"

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

const schema = z.object({
  amount: z.number().positive().optional(),
  channels: z.array(z.enum(["WHATSAPP", "EMAIL"])).optional(),
})

/** POST: create a charge for the invoice and optionally send the link. */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    try {
      const { charge, paymentLink } = await createChargeForInvoice({
        invoiceId: params.id,
        clinicId: user.clinicId,
        amount: parsed.data.amount,
        createdByUserId: user.id,
      })

      if (parsed.data.channels && parsed.data.channels.length > 0) {
        await sendChargeNotifications({
          chargeId: charge.id,
          channels: parsed.data.channels,
          type: "PAYMENT_LINK",
        })
      }

      await audit.log({
        user,
        action: AuditAction.PAYMENT_CHARGE_CREATED,
        entityType: "PaymentCharge",
        entityId: charge.id,
        newValues: { invoiceId: params.id, amount: charge.amount },
        request: req,
      })

      return NextResponse.json({ charge, paymentLink }, { status: 201 })
    } catch (err) {
      if (err instanceof ChargeError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }
  }
)

/** GET: charge history for the invoice (with linked notifications). */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (_req, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true },
    })
    if (!invoice) return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })

    const charges = await prisma.paymentCharge.findMany({
      where: { invoiceId: params.id, clinicId: user.clinicId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        amount: true,
        paymentMethod: true,
        stripeFeeAmount: true,
        applicationFeeAmount: true,
        expiresAt: true,
        sentAt: true,
        viewedAt: true,
        paidAt: true,
        canceledAt: true,
        refundedAt: true,
        failureReason: true,
        createdViaDunning: true,
        createdAt: true,
      },
    })

    const reminderCount = await prisma.notification.count({
      where: { invoiceId: params.id, type: "PAYMENT_REMINDER" },
    })

    const base = appBaseUrl()
    const withLinks = charges.map((c) => ({
      ...c,
      paymentLink: c.status === "ABERTA" ? buildPaymentLinkUrl(base, c.id) : null,
    }))

    return NextResponse.json({ charges: withLinks, reminderCount })
  }
)
