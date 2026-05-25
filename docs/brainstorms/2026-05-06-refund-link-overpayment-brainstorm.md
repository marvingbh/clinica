---
date: 2026-05-06
topic: refund-link-overpayment
---

# Conciliação — Link Refund Debits to Overpayment Credits

## What We're Building

When a patient pays more than an invoice's value (e.g. MIRELA paid R$ 250
for a R$ 200 invoice), the operator partially reconciles the credit
with the invoice and refunds the difference (Δ) to the patient via
PIX. Today the system has two stuck transactions:

- The **credit** with R$ Δ unreconciled — sits in conciliação asking
  for attention
- The **debit** of R$ Δ that left the bank as the refund PIX — sits in
  the debit/expense flow, also without a home

These two transactions are halves of the same operation and should
cancel each other out in the books.

This feature lets the operator **link the refund debit to the original
credit** so both transactions count as fully resolved and disappear
from the queue. The link captures the amount and the operator who made
the call, with a clear audit trail.

## Why This Approach

Three options were considered (see prior conversation context):

- **A. Match the refund debit to the credit (chosen).** Real-world
  correctness — the money trail is captured. Both transactions exit
  the queue together. Audit shows what actually happened.
- **B. Manual "remainder resolved" tag with free-text note.** Trivial
  but loses the link to the debit, which still shows up unreconciled
  somewhere else.
- **C. Hybrid.** Worth keeping in mind, but A alone is sufficient when
  refunds always go through the bank account that's hooked into the
  system (as is the case here).

A wins because it matches reality: the refund is a real bank
transaction, and pretending it doesn't exist (B) just shifts the
problem.

## Key Decisions

- **New junction model `TransactionRefundLink`** linking a credit
  `BankTransaction` to a debit `BankTransaction`, with `amount`,
  `linkedAt`, and `linkedByUserId`. Many-to-many is intentional: one
  refund debit could occasionally cover multiple overpayments, and
  vice-versa.
- **A transaction is "fully resolved"** when its amount equals the sum
  of:
  - reconciliation-link amounts (to invoices for credits / expenses
    for debits), plus
  - refund-link amounts (toward the *other* side: credits with refund
    links pointing to debits, debits with refund links pointing from
    credits)
  - or the whole transaction is dismissed (`dismissReason` set).
- **Operator action:** on a partially-reconciled credit, a new
  "Identificar devolução" button opens a picker that suggests
  unreconciled DEBIT transactions in a recent window (default ±14
  days), scored by:
  - **Payer name** matches (fuzzy match against the credit's
    `payerName` and any reconciled invoice's patient name)
  - **Amount** within R$ 0.01 of the credit's leftover Δ
  - **Date** proximity (debits closer to the credit's date rank
    higher)
- **Manual override.** Operator can also pick any unreconciled debit
  even if the suggestion didn't match — so out-of-pattern cases
  (delayed refund, unusual transfer) still work.
- **Reconciliation amount must equal Δ.** A refund link's amount is
  the agreed-upon refund value. If credit has remainder R$ 50 and the
  debit picked is R$ 50.00, link amount = R$ 50. If the debit is R$
  60 (covers two refunds), the operator types the portion that
  applies (R$ 50 here); the remaining R$ 10 stays open on the debit.
- **Reverse direction supported.** From the debit side ("Identificar
  origem da devolução" on the despesas/conciliação flow) the operator
  can also link backwards. Same junction table, same rules.
- **NFS-e immune.** Refund links don't touch invoice or NFS-e state —
  the invoice was already (partially) paid and reconciled; the refund
  just balances the bank books.
- **No invoice change.** The invoice stays reconciled at the lower
  amount the operator chose (R$ 200 in MIRELA's case). The R$ 50
  doesn't go back to the invoice — it's just a bank-side adjustment.

## Open Questions

- **Should `dismissReason` be retired or kept?** With refund links and
  full reconciliation covering most cases, `dismissReason` is mainly
  for genuine non-matches (DUPLICATE, NOT_PATIENT, PERSONAL_EXPENSE,
  TRANSFER). Keeping it as-is. Refund links live alongside it.
- **Cash refunds (no debit transaction in the system).** Not in scope
  for this approach — they'd fall under approach B (free-text "remainder
  resolved" tag) which we may add later if it comes up. For now: log
  it as a `dismissReason: TRANSFER` with notes, or add a `MANUAL_REFUND`
  reason to the enum.
- **Audit detail.** How much do we want to log? At minimum: the
  operator, the two transaction IDs, the amount, and the timestamp.
  Probably also flag in audit log so it's visible in the entity timeline.
- **UI naming.** "Devolução", "Reembolso", "Estorno" — pick one term
  and use it consistently in both directions (credit ↔ debit). Tend
  toward "devolução" since that's the term the user already used.

## Next Steps

→ `/ce:plan` for implementation details:
1. New `TransactionRefundLink` model + migration
2. Suggestion algorithm (payer name, amount, date proximity)
3. Endpoint + UI for "Identificar devolução" from a credit
4. Endpoint + UI for "Identificar origem da devolução" from a debit
5. Update "transaction is resolved" logic in both queues
6. Audit log + tests
