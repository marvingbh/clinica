import { prisma } from "@/lib/prisma"
import type Stripe from "stripe"
import { deriveConnectStatus } from "@/lib/cobranca"
import {
  handleSessionPaid,
  handleSessionFailed,
  handleChargeRefunded,
} from "./payment-events"

/**
 * Validates that the event's connected account matches the clinic referenced in
 * the session metadata. Both must agree, otherwise we ignore the event (return
 * false) to prevent cross-tenant effects from spoofed/misrouted metadata.
 */
async function clinicMatchesAccount(
  clinicId: string | undefined,
  account: string | undefined
): Promise<boolean> {
  if (!clinicId || !account) return false
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { stripeConnectAccountId: true },
  })
  return clinic?.stripeConnectAccountId === account
}

/**
 * Processes a verified Stripe Connect webhook event. Extracted from the route
 * for testability. Payment events are validated against event.account AND the
 * session's metadata.clinicId before any database effect. All handlers are
 * idempotent so Stripe retries are safe.
 */
export async function handleStripeConnectEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status !== "paid") return
      if (!(await clinicMatchesAccount(session.metadata?.clinicId, event.account))) return
      await handleSessionPaid(session, event)
      break
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session
      if (!(await clinicMatchesAccount(session.metadata?.clinicId, event.account))) return
      await handleSessionFailed(session)
      break
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge
      if (!(await clinicMatchesAccount(charge.metadata?.clinicId, event.account))) return
      await handleChargeRefunded(charge)
      break
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account
      const clinic = await prisma.clinic.findUnique({
        where: { stripeConnectAccountId: account.id },
        select: { id: true, stripeConnectStatus: true },
      })
      if (!clinic || clinic.stripeConnectStatus === "DISCONNECTED") return
      const status = deriveConnectStatus({
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
      })
      if (status !== clinic.stripeConnectStatus) {
        await prisma.clinic.update({
          where: { id: clinic.id },
          data: { stripeConnectStatus: status },
        })
      }
      break
    }
  }
}
