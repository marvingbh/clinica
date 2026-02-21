import { prisma } from "@/lib/prisma"
import type Stripe from "stripe"

/**
 * Processes a verified Stripe webhook event.
 * Extracted from the route handler for testability.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id
        const clinicId = session.metadata?.clinicId
        const planId = session.metadata?.planId

        if (clinicId) {
          await prisma.clinic.update({
            where: { id: clinicId },
            data: {
              subscriptionStatus: "active",
              stripeSubscriptionId: subscriptionId,
              ...(planId ? { planId } : {}),
            },
          })
        }
      }
      break
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id

      const clinic = await prisma.clinic.findUnique({
        where: { stripeCustomerId: customerId },
      })

      if (clinic) {
        const statusMap: Record<string, string> = {
          active: "active",
          past_due: "past_due",
          canceled: "canceled",
          unpaid: "unpaid",
        }
        const newStatus = statusMap[subscription.status]
        if (newStatus) {
          await prisma.clinic.update({
            where: { id: clinic.id },
            data: { subscriptionStatus: newStatus },
          })
        }
      }
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id

      await prisma.clinic.updateMany({
        where: { stripeCustomerId: customerId },
        data: { subscriptionStatus: "canceled", stripeSubscriptionId: null },
      })
      break
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id

      if (customerId) {
        await prisma.clinic.updateMany({
          where: { stripeCustomerId: customerId },
          data: { subscriptionStatus: "past_due" },
        })
      }
      break
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id

      if (customerId) {
        await prisma.clinic.updateMany({
          where: { stripeCustomerId: customerId },
          data: { subscriptionStatus: "active" },
        })
      }
      break
    }
  }
}
