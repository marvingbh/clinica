export interface RepasseCalc {
  grossValue: number
  taxAmount: number
  afterTax: number
  repasseValue: number
}

export interface InvoiceForRepasse {
  invoiceId: string
  patientName: string
  totalSessions: number
  totalAmount: number
}

export interface RepasseInvoiceLine extends RepasseCalc {
  invoiceId: string
  patientName: string
  totalSessions: number
}

export interface RepasseSummary {
  totalInvoices: number
  totalSessions: number
  totalGross: number
  totalTax: number
  totalAfterTax: number
  totalRepasse: number
}

export const REPASSE_BILLABLE_INVOICE_STATUSES = [
  "PENDENTE", "ENVIADO", "PAGO",
] as const

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateRepasse(
  grossValue: number, taxPercent: number, repassePercent: number
): RepasseCalc {
  const taxAmount = round2(grossValue * (taxPercent / 100))
  const afterTax = round2(grossValue - taxAmount)
  const repasseValue = round2(afterTax * (repassePercent / 100))
  return { grossValue, taxAmount, afterTax, repasseValue }
}

export function buildRepasseFromInvoices(
  invoices: InvoiceForRepasse[],
  taxPercent: number,
  repassePercent: number,
): RepasseInvoiceLine[] {
  return invoices.map(inv => {
    const calc = calculateRepasse(inv.totalAmount, taxPercent, repassePercent)
    return {
      ...calc,
      invoiceId: inv.invoiceId,
      patientName: inv.patientName,
      totalSessions: inv.totalSessions,
    }
  })
}

export function calculateRepasseSummary(lines: RepasseInvoiceLine[]): RepasseSummary {
  let totalGross = 0, totalTax = 0, totalAfterTax = 0, totalRepasse = 0, totalSessions = 0

  for (const line of lines) {
    totalGross += line.grossValue
    totalTax += line.taxAmount
    totalAfterTax += line.afterTax
    totalRepasse += line.repasseValue
    totalSessions += line.totalSessions
  }

  return {
    totalInvoices: lines.length,
    totalSessions,
    totalGross: round2(totalGross),
    totalTax: round2(totalTax),
    totalAfterTax: round2(totalAfterTax),
    totalRepasse: round2(totalRepasse),
  }
}
