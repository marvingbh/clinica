import { describe, it, expect, vi, beforeEach } from "vitest"
import { handleStripeEvent } from "./handler"
import type Stripe from "stripe"

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"

const mockUpdate = vi.mocked(prisma.clinic.update)
const mockUpdateMany = vi.mocked(prisma.clinic.updateMany)
const mockFindUnique = vi.mocked(prisma.clinic.findUnique)

function makeEvent(type: string, data: unknown): Stripe.Event {
  return {
    id: "evt_test_123",
    type,
    data: { object: data },
  } as unknown as Stripe.Event
}

describe("handleStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("checkout.session.completed", () => {
    it("activates subscription when checkout completes with subscription", async () => {
      const event = makeEvent("checkout.session.completed", {
        mode: "subscription",
        subscription: "sub_abc123",
        metadata: { clinicId: "clinic-1", planId: "plan-basic" },
      })

      await handleStripeEvent(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic-1" },
        data: {
          subscriptionStatus: "active",
          stripeSubscriptionId: "sub_abc123",
          planId: "plan-basic",
        },
      })
    })

    it("handles subscription object (not string) in checkout session", async () => {
      const event = makeEvent("checkout.session.completed", {
        mode: "subscription",
        subscription: { id: "sub_obj456" },
        metadata: { clinicId: "clinic-2" },
      })

      await handleStripeEvent(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic-2" },
        data: {
          subscriptionStatus: "active",
          stripeSubscriptionId: "sub_obj456",
        },
      })
    })

    it("skips update when clinicId is missing from metadata", async () => {
      const event = makeEvent("checkout.session.completed", {
        mode: "subscription",
        subscription: "sub_abc123",
        metadata: {},
      })

      await handleStripeEvent(event)

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it("skips update when mode is not subscription", async () => {
      const event = makeEvent("checkout.session.completed", {
        mode: "payment",
        subscription: null,
        metadata: { clinicId: "clinic-1" },
      })

      await handleStripeEvent(event)

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it("does not include planId when not in metadata", async () => {
      const event = makeEvent("checkout.session.completed", {
        mode: "subscription",
        subscription: "sub_abc123",
        metadata: { clinicId: "clinic-1" },
      })

      await handleStripeEvent(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic-1" },
        data: {
          subscriptionStatus: "active",
          stripeSubscriptionId: "sub_abc123",
        },
      })
    })
  })

  describe("customer.subscription.updated", () => {
    it("updates clinic status to active when subscription becomes active", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic-1" } as never)

      const event = makeEvent("customer.subscription.updated", {
        customer: "cus_abc",
        status: "active",
      })

      await handleStripeEvent(event)

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_abc" },
      })
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic-1" },
        data: { subscriptionStatus: "active" },
      })
    })

    it("updates clinic status to past_due", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic-2" } as never)

      const event = makeEvent("customer.subscription.updated", {
        customer: "cus_xyz",
        status: "past_due",
      })

      await handleStripeEvent(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic-2" },
        data: { subscriptionStatus: "past_due" },
      })
    })

    it("updates clinic status to canceled", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic-3" } as never)

      const event = makeEvent("customer.subscription.updated", {
        customer: "cus_xyz",
        status: "canceled",
      })

      await handleStripeEvent(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic-3" },
        data: { subscriptionStatus: "canceled" },
      })
    })

    it("updates clinic status to unpaid", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic-4" } as never)

      const event = makeEvent("customer.subscription.updated", {
        customer: "cus_xyz",
        status: "unpaid",
      })

      await handleStripeEvent(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic-4" },
        data: { subscriptionStatus: "unpaid" },
      })
    })

    it("handles customer object (not string)", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic-1" } as never)

      const event = makeEvent("customer.subscription.updated", {
        customer: { id: "cus_obj" },
        status: "active",
      })

      await handleStripeEvent(event)

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_obj" },
      })
    })

    it("skips update when clinic not found", async () => {
      mockFindUnique.mockResolvedValue(null)

      const event = makeEvent("customer.subscription.updated", {
        customer: "cus_unknown",
        status: "active",
      })

      await handleStripeEvent(event)

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it("skips update for unmapped subscription status", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic-1" } as never)

      const event = makeEvent("customer.subscription.updated", {
        customer: "cus_abc",
        status: "incomplete",
      })

      await handleStripeEvent(event)

      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe("customer.subscription.deleted", () => {
    it("cancels subscription and clears subscription ID", async () => {
      const event = makeEvent("customer.subscription.deleted", {
        customer: "cus_deleted",
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_deleted" },
        data: { subscriptionStatus: "canceled", stripeSubscriptionId: null },
      })
    })

    it("handles customer object (not string)", async () => {
      const event = makeEvent("customer.subscription.deleted", {
        customer: { id: "cus_obj_del" },
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_obj_del" },
        data: { subscriptionStatus: "canceled", stripeSubscriptionId: null },
      })
    })
  })

  describe("invoice.payment_failed", () => {
    it("sets subscription to past_due on payment failure", async () => {
      const event = makeEvent("invoice.payment_failed", {
        customer: "cus_fail",
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_fail" },
        data: { subscriptionStatus: "past_due" },
      })
    })

    it("handles customer object (not string)", async () => {
      const event = makeEvent("invoice.payment_failed", {
        customer: { id: "cus_fail_obj" },
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_fail_obj" },
        data: { subscriptionStatus: "past_due" },
      })
    })

    it("skips update when customer is null", async () => {
      const event = makeEvent("invoice.payment_failed", {
        customer: null,
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).not.toHaveBeenCalled()
    })
  })

  describe("invoice.paid", () => {
    it("sets subscription to active on successful payment", async () => {
      const event = makeEvent("invoice.paid", {
        customer: "cus_paid",
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_paid" },
        data: { subscriptionStatus: "active" },
      })
    })

    it("handles customer object (not string)", async () => {
      const event = makeEvent("invoice.paid", {
        customer: { id: "cus_paid_obj" },
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: "cus_paid_obj" },
        data: { subscriptionStatus: "active" },
      })
    })

    it("skips update when customer is null", async () => {
      const event = makeEvent("invoice.paid", {
        customer: null,
      })

      await handleStripeEvent(event)

      expect(mockUpdateMany).not.toHaveBeenCalled()
    })
  })

  describe("unhandled event types", () => {
    it("does nothing for unknown event types", async () => {
      const event = makeEvent("some.unknown.event", { foo: "bar" })

      await handleStripeEvent(event)

      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockUpdateMany).not.toHaveBeenCalled()
      expect(mockFindUnique).not.toHaveBeenCalled()
    })
  })
})
