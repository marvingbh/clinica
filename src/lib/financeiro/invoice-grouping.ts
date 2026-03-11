type BillingMode = "PER_SESSION" | "MONTHLY_FIXED"
type InvoiceGrouping = "MONTHLY" | "PER_SESSION"
type InvoiceStatus = "PENDENTE" | "ENVIADO" | "PARCIAL" | "PAGO" | "CANCELADO"

export function resolveGrouping(
  clinicGrouping: InvoiceGrouping,
  patientGrouping: InvoiceGrouping | null
): InvoiceGrouping {
  return patientGrouping ?? clinicGrouping
}

export function isGroupingAllowed(
  billingMode: BillingMode,
  grouping: InvoiceGrouping
): boolean {
  if (grouping === "PER_SESSION" && billingMode === "MONTHLY_FIXED") return false
  return true
}

/**
 * Derive an aggregate status for a group of per-session invoices.
 * Cancelled invoices are ignored unless all are cancelled.
 */
export function deriveGroupStatus(statuses: InvoiceStatus[]): InvoiceStatus {
  const nonCancelled = statuses.filter(s => s !== "CANCELADO")
  if (nonCancelled.length === 0) return "CANCELADO"

  const allSame = nonCancelled.every(s => s === nonCancelled[0])
  if (allSame) return nonCancelled[0]

  const hasPago = nonCancelled.includes("PAGO")
  const hasUnpaid = nonCancelled.some(s => s !== "PAGO")
  if (hasPago && hasUnpaid) return "PARCIAL"

  if (nonCancelled.includes("PENDENTE")) return "PENDENTE"
  if (nonCancelled.includes("ENVIADO")) return "ENVIADO"
  return "PARCIAL"
}
