import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { handleStripeConnectEvent } from "./handler"

/**
 * Dedicated webhook for Stripe Connect (connected-account) events. Uses its own
 * signing secret (STRIPE_CONNECT_WEBHOOK_SECRET), separate from the platform
 * subscriptions webhook. Returns 200 after idempotent processing; unexpected
 * errors return 500 so Stripe retries.
 */
export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature || !process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("Stripe Connect webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    await handleStripeConnectEvent(event)
  } catch (error) {
    console.error("Stripe Connect webhook processing error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
