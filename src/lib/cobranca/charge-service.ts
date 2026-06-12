import { prisma } from "@/lib/prisma"
import { PaymentChargeStatus } from "@prisma/client"
import { stripe } from "@/lib/stripe"
import { computeInvoiceStatus } from "@/lib/bank-reconciliation"
import {
  buildCheckoutSessionParams,
  buildPaymentLinkUrl,
  calculateApplicationFeeCents,
  computeOpenBalance,
  toCents,
} from "@/lib/cobranca"
import { formatInvoiceReference } from "@/lib/financeiro/format"
import { maybeQueueNfseOnPayment } from "./nfse-hook"

const SESSION_STALE_MS = 23 * 60 * 60 * 1000 // regenerate before the 24h hard expiry

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export interface CreateChargeResult {
  charge: { id: string; status: PaymentChargeStatus; amount: number }
  paymentLink: string
}

/** Open balance of an invoice from its reconciliation links. */
async function openBalanceForInvoice(invoiceId: string): Promise<number> {
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { totalAmount: true, reconciliationLinks: { select: { amount: true } } },
  })
  return computeOpenBalance(
    Number(inv.totalAmount),
    inv.reconciliationLinks.map((l) => Number(l.amount))
  )
}

/**
 * Creates a charge for an invoice: cancels any open charge, computes the open
 * balance, looks up the plan take-rate, persists a PaymentCharge, and opens the
 * first Stripe Checkout Session on the clinic's connected account.
 */
export async function createChargeForInvoice(opts: {
  invoiceId: string
  clinicId: string
  amount?: number
  createdByUserId?: string
  viaDunning?: boolean
}): Promise<CreateChargeResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: opts.invoiceId, clinicId: opts.clinicId },
    select: {
      id: true,
      referenceMonth: true,
      referenceYear: true,
      patient: { select: { email: true } },
      clinic: {
        select: {
          name: true,
          stripeConnectAccountId: true,
          stripeConnectStatus: true,
          dunningConfig: { select: { linkExpirationDays: true } },
          plan: { select: { applicationFeePercent: true } },
        },
      },
    },
  })
  if (!invoice) throw new Error("Fatura não encontrada")
  const { clinic } = invoice
  if (clinic.stripeConnectStatus !== "ACTIVE" || !clinic.stripeConnectAccountId) {
    throw new ChargeError("Conecte a clínica ao Stripe para cobrar", 409)
  }

  const open = await openBalanceForInvoice(opts.invoiceId)
  const amount = opts.amount ?? open
  if (open <= 0) throw new ChargeError("Fatura sem saldo em aberto", 400)
  if (amount <= 0) throw new ChargeError("Valor inválido", 400)
  if (amount > open + 0.001) throw new ChargeError("Valor não pode exceder o saldo em aberto", 400)

  await cancelOpenChargesForInvoice(opts.invoiceId, opts.clinicId, "Nova cobrança criada")

  const linkDays = clinic.dunningConfig?.linkExpirationDays ?? 7
  const expiresAt = new Date(Date.now() + linkDays * 24 * 60 * 60 * 1000)
  const feePercent = Number(clinic.plan?.applicationFeePercent ?? 0)
  const amountCents = toCents(amount)
  const applicationFeeCents = calculateApplicationFeeCents(amountCents, feePercent)

  const charge = await prisma.paymentCharge.create({
    data: {
      clinicId: opts.clinicId,
      invoiceId: opts.invoiceId,
      amount,
      applicationFeeAmount: applicationFeeCents / 100,
      expiresAt,
      createdViaDunning: opts.viaDunning ?? false,
      createdByUserId: opts.createdByUserId ?? null,
    },
    select: { id: true, status: true, amount: true },
  })

  const paymentLink = buildPaymentLinkUrl(appBaseUrl(), charge.id)
  const description = `Fatura ${formatInvoiceReference(invoice.referenceMonth, invoice.referenceYear)} — ${clinic.name}`

  const session = await createSession({
    chargeId: charge.id,
    invoiceId: opts.invoiceId,
    clinicId: opts.clinicId,
    description,
    amountCents,
    applicationFeeCents,
    customerEmail: invoice.patient.email ?? undefined,
    paymentLink,
    connectedAccountId: clinic.stripeConnectAccountId,
    regenerationCount: 0,
  })

  await prisma.paymentCharge.update({
    where: { id: charge.id },
    data: { stripeCheckoutSessionId: session.id, sessionCreatedAt: new Date() },
  })

  return { charge: { id: charge.id, status: charge.status, amount: Number(charge.amount) }, paymentLink }
}

async function createSession(opts: {
  chargeId: string
  invoiceId: string
  clinicId: string
  description: string
  amountCents: number
  applicationFeeCents: number
  customerEmail?: string
  paymentLink: string
  connectedAccountId: string
  regenerationCount: number
}): Promise<{ id: string; url: string | null }> {
  const params = buildCheckoutSessionParams({
    chargeId: opts.chargeId,
    invoiceId: opts.invoiceId,
    clinicId: opts.clinicId,
    description: opts.description,
    amountCents: opts.amountCents,
    applicationFeeCents: opts.applicationFeeCents,
    customerEmail: opts.customerEmail,
    successUrl: `${appBaseUrl()}/pagar/obrigado`,
    cancelUrl: opts.paymentLink,
  })
  const session = await stripe.checkout.sessions.create(params, {
    stripeAccount: opts.connectedAccountId,
    idempotencyKey: `charge-${opts.chargeId}-${opts.regenerationCount}`,
  })
  return { id: session.id, url: session.url }
}

/**
 * Cancels all ABERTA charges for an invoice (expires Stripe sessions best-effort).
 * Called by recalc / cancel / delete of an invoice and by createChargeForInvoice.
 * Returns the number of charges canceled.
 */
export async function cancelOpenChargesForInvoice(
  invoiceId: string,
  clinicId: string,
  reason: string
): Promise<number> {
  const open = await prisma.paymentCharge.findMany({
    where: { invoiceId, clinicId, status: PaymentChargeStatus.ABERTA },
    select: { id: true, stripeCheckoutSessionId: true, clinic: { select: { stripeConnectAccountId: true } } },
  })
  if (open.length === 0) return 0

  for (const charge of open) {
    if (charge.stripeCheckoutSessionId && charge.clinic.stripeConnectAccountId) {
      try {
        await stripe.checkout.sessions.expire(charge.stripeCheckoutSessionId, {
          stripeAccount: charge.clinic.stripeConnectAccountId,
        })
      } catch {
        // best-effort: session may already be expired/completed
      }
    }
  }

  await prisma.paymentCharge.updateMany({
    where: { id: { in: open.map((c) => c.id) } },
    data: { status: PaymentChargeStatus.CANCELADA, canceledAt: new Date(), failureReason: reason },
  })
  return open.length
}

/**
 * Used by the public stable link. Returns a fresh Checkout Session URL,
 * regenerating the session if it is missing or older than ~23h.
 */
export async function regenerateSessionIfNeeded(chargeId: string): Promise<string | null> {
  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId },
    select: {
      id: true,
      clinicId: true,
      invoiceId: true,
      amount: true,
      regenerationCount: true,
      sessionCreatedAt: true,
      stripeCheckoutSessionId: true,
      invoice: {
        select: {
          referenceMonth: true,
          referenceYear: true,
          patient: { select: { email: true } },
          clinic: { select: { name: true, stripeConnectAccountId: true, plan: { select: { applicationFeePercent: true } } } },
        },
      },
    },
  })
  if (!charge || !charge.invoice.clinic.stripeConnectAccountId) return null

  const stale =
    !charge.sessionCreatedAt || Date.now() - charge.sessionCreatedAt.getTime() > SESSION_STALE_MS

  const connectedAccountId = charge.invoice.clinic.stripeConnectAccountId

  if (!stale && charge.stripeCheckoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(charge.stripeCheckoutSessionId, {
        stripeAccount: connectedAccountId,
      })
      if (existing.url && existing.status === "open") return existing.url
    } catch {
      // fall through to regenerate
    }
  }

  const amountCents = toCents(Number(charge.amount))
  const feePercent = Number(charge.invoice.clinic.plan?.applicationFeePercent ?? 0)
  const paymentLink = buildPaymentLinkUrl(appBaseUrl(), charge.id)
  const description = `Fatura ${formatInvoiceReference(
    charge.invoice.referenceMonth,
    charge.invoice.referenceYear
  )} — ${charge.invoice.clinic.name}`

  const session = await createSession({
    chargeId: charge.id,
    invoiceId: charge.invoiceId,
    clinicId: charge.clinicId,
    description,
    amountCents,
    applicationFeeCents: calculateApplicationFeeCents(amountCents, feePercent),
    customerEmail: charge.invoice.patient.email ?? undefined,
    paymentLink,
    connectedAccountId,
    regenerationCount: charge.regenerationCount + 1,
  })

  await prisma.paymentCharge.update({
    where: { id: charge.id },
    data: {
      stripeCheckoutSessionId: session.id,
      sessionCreatedAt: new Date(),
      regenerationCount: { increment: 1 },
    },
  })
  return session.url
}

/**
 * Idempotently records a paid charge: marks PAGA, creates a STRIPE
 * ReconciliationLink, recalculates the invoice status, and queues NFS-e.
 */
export async function recordChargePaid(opts: {
  chargeId: string
  paymentIntentId: string
  paymentMethod: string
  stripeFeeAmount: number | null
}): Promise<void> {
  const charge = await prisma.paymentCharge.findUnique({
    where: { id: opts.chargeId },
    select: { id: true, clinicId: true, invoiceId: true, status: true, amount: true },
  })
  if (!charge) return
  if (charge.status === PaymentChargeStatus.PAGA) return // idempotent

  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id: charge.invoiceId },
      select: { totalAmount: true, reconciliationLinks: { select: { amount: true } } },
    })
    const totalAmount = Number(inv.totalAmount)
    const alreadyPaid = inv.reconciliationLinks.reduce((s, l) => s + Number(l.amount), 0)
    const openBefore = Math.max(0, Math.round((totalAmount - alreadyPaid) * 100) / 100)
    const linkAmount = Math.min(Number(charge.amount), openBefore)
    const net =
      opts.stripeFeeAmount != null
        ? Math.round((Number(charge.amount) - opts.stripeFeeAmount) * 100) / 100
        : null

    await tx.paymentCharge.update({
      where: { id: charge.id },
      data: {
        status: PaymentChargeStatus.PAGA,
        paidAt: new Date(),
        paymentMethod: opts.paymentMethod,
        stripePaymentIntentId: opts.paymentIntentId,
        stripeFeeAmount: opts.stripeFeeAmount,
        netAmount: net,
        failureReason: null,
      },
    })

    if (linkAmount > 0) {
      await tx.reconciliationLink.create({
        data: {
          clinicId: charge.clinicId,
          paymentChargeId: charge.id,
          invoiceId: charge.invoiceId,
          source: "STRIPE",
          amount: linkAmount,
        },
      })
    }

    const newPaid = alreadyPaid + linkAmount
    const newStatus = computeInvoiceStatus(newPaid, totalAmount)
    await tx.invoice.update({
      where: { id: charge.invoiceId },
      data: { status: newStatus, paidAt: newStatus === "PAGO" ? new Date() : null },
    })
  })

  await maybeQueueNfseOnPayment(charge.invoiceId)
}

/**
 * Marks an ABERTA/paid charge as failed (async Pix declined). Keeps the charge
 * ABERTA so the patient can retry on the stable link, recording the reason.
 * Idempotent: a charge already PAGA is left untouched.
 */
export async function recordChargeFailed(opts: {
  chargeId: string
  failureReason: string
}): Promise<void> {
  const charge = await prisma.paymentCharge.findUnique({
    where: { id: opts.chargeId },
    select: { id: true, status: true },
  })
  if (!charge) return
  if (charge.status === PaymentChargeStatus.PAGA) return
  await prisma.paymentCharge.update({
    where: { id: charge.id },
    data: { status: PaymentChargeStatus.ABERTA, failureReason: opts.failureReason },
  })
}

/**
 * Applies a Stripe refund to a paid charge (from the charge.refunded webhook).
 * Full refund removes the STRIPE ReconciliationLink and marks the charge
 * REEMBOLSADA; partial refund reduces the link amount. Recomputes invoice status.
 * Idempotent by refunded total: re-running with the same amountRefunded is a no-op.
 */
export async function applyRefund(opts: {
  paymentIntentId: string
  amountRefundedCents: number
}): Promise<void> {
  const charge = await prisma.paymentCharge.findUnique({
    where: { stripePaymentIntentId: opts.paymentIntentId },
    select: { id: true, clinicId: true, invoiceId: true, amount: true, status: true },
  })
  if (!charge) return

  const chargeAmount = Number(charge.amount)
  const refunded = opts.amountRefundedCents / 100
  const isFull = refunded + 0.001 >= chargeAmount

  await prisma.$transaction(async (tx) => {
    const link = await tx.reconciliationLink.findFirst({
      where: { paymentChargeId: charge.id, invoiceId: charge.invoiceId, source: "STRIPE" },
      select: { id: true, amount: true },
    })

    if (isFull) {
      if (link) await tx.reconciliationLink.delete({ where: { id: link.id } })
      await tx.paymentCharge.update({
        where: { id: charge.id },
        data: { status: PaymentChargeStatus.REEMBOLSADA, refundedAt: new Date() },
      })
    } else if (link) {
      const newAmount = Math.max(0, Math.round((Number(link.amount) - refunded) * 100) / 100)
      if (newAmount <= 0) {
        await tx.reconciliationLink.delete({ where: { id: link.id } })
      } else {
        await tx.reconciliationLink.update({ where: { id: link.id }, data: { amount: newAmount } })
      }
      await tx.paymentCharge.update({
        where: { id: charge.id },
        data: { refundedAt: new Date() },
      })
    }

    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id: charge.invoiceId },
      select: { totalAmount: true, reconciliationLinks: { select: { amount: true } } },
    })
    const totalAmount = Number(inv.totalAmount)
    const paid = inv.reconciliationLinks.reduce((s, l) => s + Number(l.amount), 0)
    const newStatus = computeInvoiceStatus(paid, totalAmount)
    await tx.invoice.update({
      where: { id: charge.invoiceId },
      data: { status: newStatus, paidAt: newStatus === "PAGO" ? undefined : null },
    })
  })
}

/**
 * Requests a refund on the clinic's connected account for a PAGA charge.
 * Optimistic: the ReconciliationLink reduction / status reopen happens via
 * the charge.refunded webhook. Returns the Stripe refund id.
 */
export async function requestRefund(opts: {
  chargeId: string
  clinicId: string
  amount?: number
}): Promise<string> {
  const charge = await prisma.paymentCharge.findFirst({
    where: { id: opts.chargeId, clinicId: opts.clinicId },
    select: {
      id: true,
      status: true,
      stripePaymentIntentId: true,
      clinic: { select: { stripeConnectAccountId: true } },
    },
  })
  if (!charge) throw new ChargeError("Cobrança não encontrada", 404)
  if (charge.status !== PaymentChargeStatus.PAGA) {
    throw new ChargeError("Apenas cobranças pagas podem ser reembolsadas", 400)
  }
  if (!charge.stripePaymentIntentId || !charge.clinic.stripeConnectAccountId) {
    throw new ChargeError("Cobrança sem pagamento Stripe associado", 400)
  }

  const refund = await stripe.refunds.create(
    {
      payment_intent: charge.stripePaymentIntentId,
      amount: opts.amount != null ? toCents(opts.amount) : undefined,
    },
    { stripeAccount: charge.clinic.stripeConnectAccountId }
  )
  return refund.id
}

/**
 * For the dunning cron: returns the id of a reusable ABERTA, non-expired charge
 * for the invoice, or creates a fresh one (createdViaDunning=true). Throws a
 * ChargeError if the invoice has no open balance or Connect is not ACTIVE.
 */
export async function ensureChargeForDunning(
  invoiceId: string,
  clinicId: string
): Promise<string> {
  const existing = await prisma.paymentCharge.findFirst({
    where: {
      invoiceId,
      clinicId,
      status: PaymentChargeStatus.ABERTA,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (existing) return existing.id

  const { charge } = await createChargeForInvoice({ invoiceId, clinicId, viaDunning: true })
  return charge.id
}

/** Error carrying an HTTP status for thin route adapters. */
export class ChargeError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
