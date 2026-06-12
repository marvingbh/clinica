import { NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { requestRefund, ChargeError } from "@/lib/cobranca/charge-service"

const schema = z.object({ amount: z.number().positive().optional() })

/**
 * POST /api/financeiro/faturas/[id]/cobranca/[chargeId]/reembolso
 * Requests a Stripe refund on the connected account. The final effect
 * (reconciliation reversal, status reopen) is applied by the webhook.
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    try {
      const refundId = await requestRefund({
        chargeId: params.chargeId,
        clinicId: user.clinicId,
        amount: parsed.data.amount,
      })

      await audit.log({
        user,
        action: AuditAction.PAYMENT_CHARGE_REFUNDED,
        entityType: "PaymentCharge",
        entityId: params.chargeId,
        newValues: { refundId, amount: parsed.data.amount ?? null },
        request: req,
      })

      return NextResponse.json({ ok: true, refundId })
    } catch (err) {
      if (err instanceof ChargeError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }
  }
)
