/**
 * Compute the invoice status based on how much has been paid.
 */
export function computeInvoiceStatus(
  paidAmount: number,
  totalAmount: number
): "PENDENTE" | "PARCIAL" | "PAGO" {
  if (paidAmount <= 0) return "PENDENTE"
  if (paidAmount >= totalAmount) return "PAGO"
  return "PARCIAL"
}

/**
 * Compute the smart default amount when linking a transaction to an invoice.
 * Returns min(transactionRemaining, invoiceRemaining).
 */
export function computeSmartDefault(
  transactionRemaining: number,
  invoiceRemaining: number
): number {
  return Math.min(
    Math.max(0, transactionRemaining),
    Math.max(0, invoiceRemaining)
  )
}

/**
 * Allocate a transaction's remaining amount across a group of invoices.
 * Each invoice receives up to its own remaining amount, never more.
 * When the transaction cannot cover the full group, invoices are filled
 * in order and the last partial invoice takes the shortfall.
 */
export function allocateGroupPayment(
  invoices: Array<{ invoiceId: string; remainingAmount: number }>,
  transactionRemaining: number
): Array<{ invoiceId: string; amount: number }> {
  let pool = Math.max(0, transactionRemaining)
  const result: Array<{ invoiceId: string; amount: number }> = []
  for (const inv of invoices) {
    const want = Math.max(0, inv.remainingAmount)
    const give = Math.min(want, pool)
    const rounded = Math.round(give * 100) / 100
    result.push({ invoiceId: inv.invoiceId, amount: rounded })
    pool = Math.max(0, pool - rounded)
  }
  return result
}
