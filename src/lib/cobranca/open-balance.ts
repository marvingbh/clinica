/**
 * Open balance (saldo em aberto) of an invoice: total minus everything
 * already reconciled (bank links + Stripe charges). Never negative.
 * Mirrors the round-to-2 semantics used by the reconcile route.
 */
export function computeOpenBalance(totalAmount: number, linkAmounts: number[]): number {
  const reconciled = linkAmounts.reduce((sum, a) => sum + a, 0)
  const open = totalAmount - reconciled
  const rounded = Math.round(open * 100) / 100
  return Math.max(0, rounded)
}
