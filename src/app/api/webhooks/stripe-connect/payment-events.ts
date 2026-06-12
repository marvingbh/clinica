import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import {
  recordChargePaid,
  recordChargeFailed,
  applyRefund,
} from "@/lib/cobranca/charge-service"

/**
 * Resolves the connected account id the event arrived on. Connect events carry
 * `event.account`; we use it to fetch expanded resources from the right account.
 */
function accountFor(event: Stripe.Event): string | undefined {
  return event.account
}

/** Reads the payment method type ("pix" | "card") from a PaymentIntent. */
function paymentMethodOf(pi: Stripe.PaymentIntent | null): string {
  const types = pi?.payment_method_types ?? []
  const charge = pi?.latest_charge
  if (charge && typeof charge !== "string") {
    const detail = charge.payment_method_details?.type
    if (detail) return detail
  }
  return types[0] ?? "card"
}

/**
 * Fetches the Stripe fee (in R$) and payment method for a session's PaymentIntent
 * by expanding the latest charge's balance transaction on the connected account.
 * Returns null fee if it cannot be resolved (recordChargePaid tolerates null).
 */
async function resolvePaymentDetails(
  paymentIntentId: string,
  account: string | undefined
): Promise<{ paymentMethod: string; stripeFeeAmount: number | null }> {
  try {
    const pi = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge.balance_transaction"] },
      account ? { stripeAccount: account } : undefined
    )
    let fee: number | null = null
    const charge = pi.latest_charge
    if (charge && typeof charge !== "string") {
      const bt = charge.balance_transaction
      if (bt && typeof bt !== "string") fee = bt.fee / 100
    }
    return { paymentMethod: paymentMethodOf(pi), stripeFeeAmount: fee }
  } catch {
    return { paymentMethod: "card", stripeFeeAmount: null }
  }
}

/** Extracts the PaymentIntent id from a checkout session (string or object). */
function paymentIntentIdOf(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent
  if (!pi) return null
  return typeof pi === "string" ? pi : pi.id
}

/**
 * Handles a paid Checkout Session (sync card or async Pix success).
 * Idempotent via recordChargePaid (skips charges already PAGA).
 */
export async function handleSessionPaid(
  session: Stripe.Checkout.Session,
  event: Stripe.Event
): Promise<void> {
  const chargeId = session.metadata?.chargeId
  if (!chargeId) return
  const paymentIntentId = paymentIntentIdOf(session)
  if (!paymentIntentId) return

  const { paymentMethod, stripeFeeAmount } = await resolvePaymentDetails(
    paymentIntentId,
    accountFor(event)
  )

  await recordChargePaid({ chargeId, paymentIntentId, paymentMethod, stripeFeeAmount })
}

/** Handles an async (Pix) payment failure: reopens the charge. */
export async function handleSessionFailed(session: Stripe.Checkout.Session): Promise<void> {
  const chargeId = session.metadata?.chargeId
  if (!chargeId) return
  await recordChargeFailed({ chargeId, failureReason: "Pagamento Pix não confirmado" })
}

/** Handles charge.refunded (full or partial) for a connected-account charge. */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id
  if (!paymentIntentId) return
  await applyRefund({ paymentIntentId, amountRefundedCents: charge.amount_refunded })
}
