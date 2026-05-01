import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { handleStripeEvent } from "./handler"

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // B14: atomic idempotency gate. INSERT before handler. The unique constraint
  // on eventId means two concurrent retries can't both run the handler.
  let isRetryAfterCrash = false
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        eventId: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.stripeWebhookEvent.findUnique({
        where: { eventId: event.id },
      })
      if (existing?.processedAt) {
        return NextResponse.json({ received: true, duplicate: true })
      }
      // Previous attempt crashed mid-flight — clear error and let the handler re-run.
      isRetryAfterCrash = true
    } else {
      throw err
    }
  }

  try {
    await handleStripeEvent(event)
    await prisma.stripeWebhookEvent.update({
      where: { eventId: event.id },
      data: { processedAt: new Date(), error: null },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Stripe webhook processing error:", error)
    await prisma.stripeWebhookEvent.update({
      where: { eventId: event.id },
      data: { error: message.slice(0, 2000) },
    }).catch(() => {})
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true, retried: isRetryAfterCrash })
}
