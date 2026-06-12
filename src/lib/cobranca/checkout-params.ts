import type Stripe from "stripe"

/** Stripe Checkout Sessions live at most 24h — the stable link regenerates them. */
export const SESSION_MAX_DURATION_SECONDS = 24 * 60 * 60

export interface CheckoutInput {
  chargeId: string
  invoiceId: string
  clinicId: string
  description: string // "Fatura 06/2026 — Clínica X"
  amountCents: number
  applicationFeeCents: number
  customerEmail?: string
  successUrl: string
  cancelUrl: string
  /** Now in epoch seconds; injected for testability. Defaults to Date.now(). */
  nowSeconds?: number
}

/**
 * Pure builder for the Stripe Checkout Session params used by a charge.
 * mode=payment, BRL, card + pix, metadata duplicated on session and the
 * underlying PaymentIntent, application_fee_amount only when > 0.
 */
export function buildCheckoutSessionParams(
  input: CheckoutInput
): Stripe.Checkout.SessionCreateParams {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const metadata: Record<string, string> = {
    chargeId: input.chargeId,
    invoiceId: input.invoiceId,
    clinicId: input.clinicId,
  }

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata,
  }
  if (input.applicationFeeCents > 0) {
    paymentIntentData.application_fee_amount = input.applicationFeeCents
  }

  return {
    mode: "payment",
    payment_method_types: ["card", "pix"],
    expires_at: now + SESSION_MAX_DURATION_SECONDS,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail,
    metadata,
    payment_intent_data: paymentIntentData,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: input.amountCents,
          product_data: { name: input.description },
        },
      },
    ],
  }
}
