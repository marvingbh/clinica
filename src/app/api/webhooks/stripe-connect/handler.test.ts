import { describe, it, expect, vi, beforeEach } from "vitest"
import type Stripe from "stripe"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("@/lib/cobranca/charge-service", () => ({
  recordChargePaid: vi.fn(),
  recordChargeFailed: vi.fn(),
  applyRefund: vi.fn(),
}))

// Avoid building a real Stripe client during PaymentIntent expansion.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        payment_method_types: ["card"],
        latest_charge: {
          payment_method_details: { type: "card" },
          balance_transaction: { fee: 350 },
        },
      }),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { handleStripeConnectEvent } from "./handler"
import { recordChargePaid, recordChargeFailed, applyRefund } from "@/lib/cobranca/charge-service"

const mockFindUnique = vi.mocked(prisma.clinic.findUnique)
const mockUpdate = vi.mocked(prisma.clinic.update)
const mockRecordPaid = vi.mocked(recordChargePaid)
const mockRecordFailed = vi.mocked(recordChargeFailed)
const mockApplyRefund = vi.mocked(applyRefund)

function makeEvent(type: string, object: unknown, account = "acct_clinic1"): Stripe.Event {
  return {
    id: "evt_1",
    type,
    account,
    data: { object },
  } as unknown as Stripe.Event
}

describe("handleStripeConnectEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("checkout.session.completed", () => {
    it("records a paid charge when account matches the clinic", async () => {
      mockFindUnique.mockResolvedValue({ stripeConnectAccountId: "acct_clinic1" } as never)
      const event = makeEvent("checkout.session.completed", {
        payment_status: "paid",
        payment_intent: "pi_1",
        metadata: { chargeId: "charge_1", clinicId: "clinic_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockRecordPaid).toHaveBeenCalledWith(
        expect.objectContaining({ chargeId: "charge_1", paymentIntentId: "pi_1" })
      )
    })

    it("is a no-op when the account does not match the clinic", async () => {
      mockFindUnique.mockResolvedValue({ stripeConnectAccountId: "acct_OTHER" } as never)
      const event = makeEvent("checkout.session.completed", {
        payment_status: "paid",
        payment_intent: "pi_1",
        metadata: { chargeId: "charge_1", clinicId: "clinic_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockRecordPaid).not.toHaveBeenCalled()
    })

    it("is a no-op when clinicId is missing from metadata", async () => {
      const event = makeEvent("checkout.session.completed", {
        payment_status: "paid",
        payment_intent: "pi_1",
        metadata: { chargeId: "charge_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockFindUnique).not.toHaveBeenCalled()
      expect(mockRecordPaid).not.toHaveBeenCalled()
    })

    it("skips sessions that are not paid yet (Pix pending)", async () => {
      const event = makeEvent("checkout.session.completed", {
        payment_status: "unpaid",
        payment_intent: "pi_1",
        metadata: { chargeId: "charge_1", clinicId: "clinic_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockRecordPaid).not.toHaveBeenCalled()
    })
  })

  describe("checkout.session.async_payment_succeeded", () => {
    it("records a paid charge for async Pix success", async () => {
      mockFindUnique.mockResolvedValue({ stripeConnectAccountId: "acct_clinic1" } as never)
      const event = makeEvent("checkout.session.async_payment_succeeded", {
        payment_status: "paid",
        payment_intent: "pi_pix",
        metadata: { chargeId: "charge_pix", clinicId: "clinic_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockRecordPaid).toHaveBeenCalledWith(
        expect.objectContaining({ chargeId: "charge_pix", paymentIntentId: "pi_pix" })
      )
    })
  })

  describe("checkout.session.async_payment_failed", () => {
    it("reopens the charge with a failure reason", async () => {
      mockFindUnique.mockResolvedValue({ stripeConnectAccountId: "acct_clinic1" } as never)
      const event = makeEvent("checkout.session.async_payment_failed", {
        payment_intent: "pi_fail",
        metadata: { chargeId: "charge_fail", clinicId: "clinic_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockRecordFailed).toHaveBeenCalledWith(
        expect.objectContaining({ chargeId: "charge_fail" })
      )
    })
  })

  describe("charge.refunded", () => {
    it("applies a refund when account matches", async () => {
      mockFindUnique.mockResolvedValue({ stripeConnectAccountId: "acct_clinic1" } as never)
      const event = makeEvent("charge.refunded", {
        payment_intent: "pi_ref",
        amount_refunded: 30000,
        metadata: { clinicId: "clinic_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockApplyRefund).toHaveBeenCalledWith({
        paymentIntentId: "pi_ref",
        amountRefundedCents: 30000,
      })
    })

    it("does not apply a refund on account mismatch", async () => {
      mockFindUnique.mockResolvedValue({ stripeConnectAccountId: "acct_OTHER" } as never)
      const event = makeEvent("charge.refunded", {
        payment_intent: "pi_ref",
        amount_refunded: 30000,
        metadata: { clinicId: "clinic_1" },
      })

      await handleStripeConnectEvent(event)

      expect(mockApplyRefund).not.toHaveBeenCalled()
    })
  })

  describe("account.updated", () => {
    it("syncs status to ACTIVE when charges are enabled", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic_1", stripeConnectStatus: "ONBOARDING" } as never)
      const event = makeEvent("account.updated", {
        id: "acct_clinic1",
        charges_enabled: true,
        details_submitted: true,
      })

      await handleStripeConnectEvent(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "clinic_1" },
        data: { stripeConnectStatus: "ACTIVE" },
      })
    })

    it("does not resurrect a DISCONNECTED clinic", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic_1", stripeConnectStatus: "DISCONNECTED" } as never)
      const event = makeEvent("account.updated", {
        id: "acct_clinic1",
        charges_enabled: true,
        details_submitted: true,
      })

      await handleStripeConnectEvent(event)

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it("does not write when status is unchanged", async () => {
      mockFindUnique.mockResolvedValue({ id: "clinic_1", stripeConnectStatus: "ACTIVE" } as never)
      const event = makeEvent("account.updated", {
        id: "acct_clinic1",
        charges_enabled: true,
        details_submitted: true,
      })

      await handleStripeConnectEvent(event)

      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe("unhandled events", () => {
    it("ignores unknown event types", async () => {
      const event = makeEvent("payment_intent.created", {})
      await handleStripeConnectEvent(event)
      expect(mockRecordPaid).not.toHaveBeenCalled()
      expect(mockApplyRefund).not.toHaveBeenCalled()
    })
  })
})
