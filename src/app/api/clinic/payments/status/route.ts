import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { stripe } from "@/lib/stripe"
import { deriveConnectStatus } from "@/lib/cobranca"

/**
 * GET /api/clinic/payments/status
 * Returns the clinic's Connect status, syncing live with Stripe when an
 * account exists and is not explicitly DISCONNECTED.
 */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (_req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, stripeConnectAccountId: true, stripeConnectStatus: true },
    })
    if (!clinic) return NextResponse.json({ error: "Clínica não encontrada" }, { status: 404 })

    if (!clinic.stripeConnectAccountId || clinic.stripeConnectStatus === "DISCONNECTED") {
      return NextResponse.json({
        status: clinic.stripeConnectStatus,
        chargesEnabled: false,
        accountId: clinic.stripeConnectAccountId,
      })
    }

    let status = clinic.stripeConnectStatus
    let chargesEnabled = false
    try {
      const account = await stripe.accounts.retrieve(clinic.stripeConnectAccountId)
      chargesEnabled = account.charges_enabled
      status = deriveConnectStatus({
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
      })
      if (status !== clinic.stripeConnectStatus) {
        await prisma.clinic.update({
          where: { id: clinic.id },
          data: { stripeConnectStatus: status },
        })
      }
    } catch {
      // keep persisted status if Stripe is unreachable
    }

    return NextResponse.json({
      status,
      chargesEnabled,
      accountId: clinic.stripeConnectAccountId,
    })
  }
)
