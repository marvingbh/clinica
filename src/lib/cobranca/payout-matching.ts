import { normalizeForComparison } from "@/lib/bank-reconciliation"

/**
 * Recognizes a bank statement CREDIT line as a Stripe payout (repasse).
 * Accent/case-insensitive: the normalized description contains "stripe".
 */
export function isStripePayoutDescription(description: string): boolean {
  return normalizeForComparison(description).includes("stripe")
}

export interface PayoutCandidate {
  chargeId: string
  netAmount: number
  paidAt: Date
}

export interface PayoutMatchResult {
  matched: boolean
  chargeIds: string[]
  difference: number
}

/**
 * Sums netAmount of ALL unmatched paid charges whose paidAt <= payoutDate
 * and reports whether the total is within tolerance of the payout amount.
 * No subset-sum: the difference is surfaced and the decision is human.
 *
 * @param payoutAmount  payout value in R$ decimal
 * @param candidates    paid, not-yet-payout-matched charges
 * @param payoutDate    statement date of the payout line
 * @param toleranceCents  acceptable absolute difference in cents (default 1)
 */
export function matchStripePayout(
  payoutAmount: number,
  candidates: PayoutCandidate[],
  payoutDate: Date,
  toleranceCents = 1
): PayoutMatchResult {
  const eligible = candidates.filter((c) => c.paidAt.getTime() <= payoutDate.getTime())
  const sum = eligible.reduce((s, c) => s + c.netAmount, 0)
  const difference = Math.round((sum - payoutAmount) * 100) / 100
  const matched =
    eligible.length > 0 && Math.abs(difference) * 100 <= toleranceCents
  return {
    matched,
    chargeIds: eligible.map((c) => c.chargeId),
    difference,
  }
}
