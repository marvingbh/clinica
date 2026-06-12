import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { cancelOpenChargesForInvoice } from "@/lib/cobranca/charge-service"

/**
 * DELETE /api/financeiro/faturas/[id]/cobranca/[chargeId]
 * Cancels the open charge (expires its Stripe session).
 */
export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const charge = await prisma.paymentCharge.findFirst({
      where: { id: params.chargeId, invoiceId: params.id, clinicId: user.clinicId },
      select: { id: true, status: true },
    })
    if (!charge) return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    if (charge.status !== "ABERTA") {
      return NextResponse.json({ error: "Apenas cobranças abertas podem ser canceladas" }, { status: 400 })
    }

    await cancelOpenChargesForInvoice(params.id, user.clinicId, "Cancelada manualmente")

    await audit.log({
      user,
      action: AuditAction.PAYMENT_CHARGE_CANCELED,
      entityType: "PaymentCharge",
      entityId: charge.id,
      request: req,
    })

    return NextResponse.json({ ok: true })
  }
)
