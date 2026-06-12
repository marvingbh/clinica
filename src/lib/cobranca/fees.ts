/**
 * Pure money math for the cobrança module. All amounts in integer cents
 * unless explicitly a "R$ decimal" (number with up to 2 decimal places).
 */

/**
 * Stripe application fee (platform take-rate) in integer cents.
 * floor(amountCents * feePercent / 100). Clamped to [0, amountCents].
 */
export function calculateApplicationFeeCents(amountCents: number, feePercent: number): number {
  if (feePercent <= 0 || amountCents <= 0) return 0
  const fee = Math.floor((amountCents * feePercent) / 100)
  return Math.min(Math.max(0, fee), amountCents)
}

/** R$ decimal -> integer cents (round to nearest cent). */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Integer cents -> R$ decimal (2 places). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}
