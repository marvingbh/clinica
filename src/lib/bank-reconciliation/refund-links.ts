/**
 * Pure helpers for the refund-link feature (overpayment + outgoing PIX
 * refund pairing). React-free, Prisma-free; the route handlers compose
 * these with Prisma calls.
 */

import { nameSimilarity, nameContainedIn } from "./matcher"

/** Tolerance for decimal arithmetic, matching the existing reconcile route. */
export const AMOUNT_TOLERANCE = 0.01

/** Default window (days) around the source transaction's date for candidate suggestions. */
export const CANDIDATE_WINDOW_DAYS = 14

/**
 * How much of `amount` is still unaccounted for after applying existing
 * reconciliation links and refund links. Returns a non-negative number,
 * snapped to 0 when within tolerance.
 */
export function computeRemainingAmount(
  amount: number,
  reconciledTotal: number,
  refundedTotal: number,
): number {
  const remaining = amount - reconciledTotal - refundedTotal
  return remaining < AMOUNT_TOLERANCE ? 0 : remaining
}

/**
 * True when the transaction's amount is fully accounted for OR when it's
 * been dismissed (operator opted out of reconciling it). Mirrors the
 * existing `isFullyReconciled` semantics but extends to refund links.
 */
export function isTransactionFullyResolved(args: {
  amount: number
  reconciledTotal: number
  refundedTotal: number
  isDismissed: boolean
}): boolean {
  if (args.isDismissed) return true
  return computeRemainingAmount(args.amount, args.reconciledTotal, args.refundedTotal) === 0
}

/**
 * Sums the `amount` field of an array of links/rows. Tolerates `Decimal`-like
 * inputs by coercing through Number().
 */
export function sumAmounts(rows: { amount: number | string | { toNumber(): number } }[]): number {
  let total = 0
  for (const row of rows) {
    const v = row.amount as { toNumber?: () => number } | number | string
    total += typeof v === "object" && v !== null && typeof v.toNumber === "function"
      ? v.toNumber()
      : Number(v)
  }
  return total
}

export interface RefundCandidateInput {
  id: string
  amount: number
  date: Date | string
  payerName: string | null
  description: string | null
}

export interface RankedRefundCandidate {
  id: string
  score: number
  reasons: string[]
}

/**
 * Score weights for refund candidate ranking. Tuned by intent:
 *  - amount near-Δ is the strongest signal (a refund typically equals the leftover)
 *  - payer name similarity is important but less reliable for some banks
 *  - date proximity is a tiebreaker
 */
const W_AMOUNT = 0.55
const W_NAME = 0.3
const W_DATE = 0.15

function dateProximityScore(srcDate: Date, candDate: Date, windowDays: number): number {
  const diffDays = Math.abs((srcDate.getTime() - candDate.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays > windowDays) return 0
  return 1 - diffDays / windowDays
}

function amountProximityScore(target: number, candidate: number): number {
  if (target <= 0) return 0
  // Exact (within tolerance) → 1; halves to ~0 at 50% of target away.
  const diff = Math.abs(target - candidate)
  if (diff <= AMOUNT_TOLERANCE) return 1
  const ratio = diff / target
  if (ratio >= 1) return 0
  return Math.max(0, 1 - ratio)
}

/**
 * Rank candidates by similarity to the source transaction's leftover.
 * Source transaction provides:
 *   - `remainingAmount`: target Δ to refund
 *   - `payerName`: original payer text from the bank
 *   - `relatedNames`: any patient/guardian names linked to the source via
 *     reconciliation (used to widen the name-match net)
 *   - `date`: source transaction date (proximity anchor)
 *
 * Returns sorted desc by score; entries with score < 0.1 are dropped
 * unless they're the only matches available.
 */
export function rankRefundCandidates(args: {
  remainingAmount: number
  sourcePayerName: string | null
  relatedNames: string[]
  sourceDate: Date
  candidates: RefundCandidateInput[]
  windowDays?: number
}): RankedRefundCandidate[] {
  const windowDays = args.windowDays ?? CANDIDATE_WINDOW_DAYS
  const ranked: RankedRefundCandidate[] = []

  for (const c of args.candidates) {
    const reasons: string[] = []

    const amountScore = amountProximityScore(args.remainingAmount, c.amount)
    if (amountScore >= 0.99) reasons.push("Valor exato")
    else if (amountScore >= 0.7) reasons.push("Valor próximo")

    const cName = c.payerName ?? c.description ?? ""
    let nameScore = 0
    if (cName) {
      // Match against the source's payer (most likely the same person)
      if (args.sourcePayerName) {
        nameScore = Math.max(nameScore, nameSimilarity(args.sourcePayerName, cName))
        if (nameContainedIn(args.sourcePayerName, cName)) {
          nameScore = Math.max(nameScore, 0.9)
        }
      }
      // And against any patient/guardian names tied to the source via
      // reconciliation — refunds sometimes go out to a different
      // beneficiary (e.g. a relative).
      for (const rel of args.relatedNames) {
        nameScore = Math.max(nameScore, nameSimilarity(rel, cName))
      }
      if (nameScore >= 0.99) reasons.push("Nome idêntico")
      else if (nameScore >= 0.5) reasons.push("Nome similar")
    }

    const candDate = c.date instanceof Date ? c.date : new Date(c.date)
    const dateScore = dateProximityScore(args.sourceDate, candDate, windowDays)
    if (dateScore >= 0.85) reasons.push("Data próxima")

    const score = W_AMOUNT * amountScore + W_NAME * nameScore + W_DATE * dateScore
    ranked.push({ id: c.id, score, reasons })
  }

  ranked.sort((a, b) => b.score - a.score)
  // Drop near-zero scores (no signals at all)
  const filtered = ranked.filter((r) => r.score >= 0.1)
  return filtered.length > 0 ? filtered : ranked.slice(0, Math.min(5, ranked.length))
}
