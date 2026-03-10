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
