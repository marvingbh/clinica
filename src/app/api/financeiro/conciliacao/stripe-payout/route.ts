import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { isStripePayoutDescription, matchStripePayout, type PayoutCandidate } from "@/lib/cobranca"

/** Paid, not-yet-payout-matched charges for a clinic, as matcher candidates. */
async function loadCandidates(clinicId: string): Promise<PayoutCandidate[]> {
  const charges = await prisma.paymentCharge.findMany({
    where: { clinicId, status: "PAGA", payoutMatchedAt: null, paidAt: { not: null } },
    select: { id: true, netAmount: true, amount: true, paidAt: true },
  })
  return charges.map((c) => ({
    chargeId: c.id,
    netAmount: Number(c.netAmount ?? c.amount),
    paidAt: c.paidAt!,
  }))
}

/** GET ?transactionId= → { isPayout, matched, chargeIds, difference } */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const transactionId = new URL(req.url).searchParams.get("transactionId")
    if (!transactionId) {
      return NextResponse.json({ error: "transactionId obrigatório" }, { status: 400 })
    }
    const tx = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, clinicId: user.clinicId },
      select: { id: true, amount: true, description: true, date: true, type: true },
    })
    if (!tx) return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 })

    const isPayout = tx.type === "CREDIT" && isStripePayoutDescription(tx.description)
    if (!isPayout) {
      return NextResponse.json({ isPayout: false, matched: false, chargeIds: [], difference: 0 })
    }

    const candidates = await loadCandidates(user.clinicId)
    const result = matchStripePayout(Number(tx.amount), candidates, tx.date)
    return NextResponse.json({ isPayout: true, ...result })
  }
)

const postSchema = z.object({ transactionId: z.string() })

/** POST { transactionId } → dismiss STRIPE_PAYOUT + mark matched charges. */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const parsed = postSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const tx = await prisma.bankTransaction.findFirst({
      where: { id: parsed.data.transactionId, clinicId: user.clinicId },
      select: { id: true, amount: true, description: true, date: true, type: true },
    })
    if (!tx) return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 })
    if (tx.type !== "CREDIT" || !isStripePayoutDescription(tx.description)) {
      return NextResponse.json({ error: "Transação não é um repasse Stripe" }, { status: 400 })
    }

    const candidates = await loadCandidates(user.clinicId)
    const result = matchStripePayout(Number(tx.amount), candidates, tx.date)
    const now = new Date()

    await prisma.$transaction(async (db) => {
      await db.bankTransaction.update({
        where: { id: tx.id },
        data: { dismissReason: "STRIPE_PAYOUT", dismissedAt: now, dismissedByUserId: user.id },
      })
      if (result.chargeIds.length > 0) {
        await db.paymentCharge.updateMany({
          where: { id: { in: result.chargeIds }, clinicId: user.clinicId },
          data: { payoutMatchedAt: now },
        })
      }
    })

    await audit.log({
      user,
      action: AuditAction.STRIPE_PAYOUT_DISMISSED,
      entityType: "BankTransaction",
      entityId: tx.id,
      newValues: { chargeIds: result.chargeIds, difference: result.difference },
      request: req,
    })

    return NextResponse.json({ ok: true, matchedCharges: result.chargeIds.length, difference: result.difference })
  }
)
