import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { stripe, isStripeConfigured, stripeNotConfiguredResponse } from "@/lib/stripe"
import { audit, AuditAction } from "@/lib/rbac/audit"

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

/**
 * POST /api/clinic/payments/connect
 * Creates a Stripe Connect Standard account (if missing) and returns an
 * onboarding Account Link. Sets status to ONBOARDING.
 */
export const POST = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    if (!isStripeConfigured()) return stripeNotConfiguredResponse()

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, email: true, stripeConnectAccountId: true },
    })
    if (!clinic) return NextResponse.json({ error: "Clínica não encontrada" }, { status: 404 })

    let accountId = clinic.stripeConnectAccountId
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        country: "BR",
        email: clinic.email ?? undefined,
        metadata: { clinicId: clinic.id },
      })
      accountId = account.id
    }

    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { stripeConnectAccountId: accountId, stripeConnectStatus: "ONBOARDING" },
    })

    const base = appBaseUrl()
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/admin/settings?tab=pagamentos&connect=refresh`,
      return_url: `${base}/admin/settings?tab=pagamentos&connect=return`,
      type: "account_onboarding",
    })

    await audit.log({
      user,
      action: AuditAction.PAYMENT_CONNECT_STARTED,
      entityType: "Clinic",
      entityId: clinic.id,
      newValues: { accountId },
      request: req,
    })

    return NextResponse.json({ url: accountLink.url })
  }
)
