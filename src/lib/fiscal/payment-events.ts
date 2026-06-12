import type { PaymentEvent } from "./types"

/**
 * Input shape for {@link collectPaymentEvents}. Matches a clinic-scoped Prisma
 * query of invoices + their reconciliation links (each link carries its backing
 * transaction's date and that transaction's refund links). Decimals already
 * converted to `number` at the route boundary.
 */
export interface PaymentLinkInput {
  reconciliationLinkId: string
  amount: number
  /** Date of the backing bank transaction (the payment date). */
  transactionDate: Date
  /** Σ TransactionRefundLink.amount on the backing credit transaction. */
  refundedAmount: number
}

export interface InvoiceWithPayments {
  invoiceId: string
  patientId: string
  professionalProfileId: string
  status: string // InvoiceStatus literal
  totalAmount: number
  /** Invoice.paidAt when marked PAGO manually (null otherwise). */
  paidAt: Date | null
  links: PaymentLinkInput[]
}

const RESIDUAL_EPSILON = 0.01

/**
 * Derives one payment event per paid installment.
 *
 * Rules:
 * - One event per ReconciliationLink (date = transactionDate, amount = link.amount).
 * - For a PAGO invoice, a residual "inv:" event of (totalAmount − Σ links) when
 *   that residual is > R$ 0,01, dated at the invoice's paidAt.
 * - A PAGO invoice with no links → a single "inv:" event for the full total.
 * - A PAGO invoice with paidAt = null still yields the residual/inv event but with
 *   paymentDate = null (surfaces as PAGAMENTO_SEM_DATA downstream).
 * - PARCIAL without links → no event (surfaces in pending-issues).
 * - CANCELADO → no events.
 */
export function collectPaymentEvents(invoices: InvoiceWithPayments[]): PaymentEvent[] {
  const events: PaymentEvent[] = []

  for (const inv of invoices) {
    if (inv.status === "CANCELADO") continue

    let linkedTotal = 0
    for (const link of inv.links) {
      linkedTotal += link.amount
      events.push({
        paymentKey: `recl:${link.reconciliationLinkId}`,
        invoiceId: inv.invoiceId,
        reconciliationLinkId: link.reconciliationLinkId,
        paymentDate: link.transactionDate,
        amount: round2(link.amount),
        patientId: inv.patientId,
        professionalProfileId: inv.professionalProfileId,
        refundedAmount: round2(link.refundedAmount),
      })
    }

    // Manual residual / full payment only for invoices marked PAGO.
    if (inv.status !== "PAGO") continue

    const residual = round2(inv.totalAmount - linkedTotal)
    if (residual <= RESIDUAL_EPSILON) continue

    events.push({
      paymentKey: `inv:${inv.invoiceId}`,
      invoiceId: inv.invoiceId,
      reconciliationLinkId: null,
      paymentDate: inv.paidAt,
      amount: residual,
      patientId: inv.patientId,
      professionalProfileId: inv.professionalProfileId,
      refundedAmount: 0,
    })
  }

  return events
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
