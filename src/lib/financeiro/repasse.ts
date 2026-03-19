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
  "PENDENTE", "ENVIADO", "PARCIAL", "PAGO",
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

// ============================================================================
// Item-level repasse (supports attending professional / substitute)
// ============================================================================

export interface InvoiceItemForRepasse {
  total: number
  attendingProfessionalId: string | null
  invoiceProfessionalId: string
  patientName: string
  invoiceId: string
}

export interface RepasseByProfessional {
  lines: RepasseInvoiceLine[]
  summary: RepasseSummary
}

/** Resolve who actually gets repasse credit for an item */
export function resolveAttendingProfId(item: InvoiceItemForRepasse): string {
  return item.attendingProfessionalId ?? item.invoiceProfessionalId
}

/**
 * Group invoice items by the attending professional and calculate repasse per professional.
 * Items with a substitute get their repasse routed to the substitute professional.
 */
export function buildRepasseByAttendingProfessional(
  items: InvoiceItemForRepasse[],
  professionals: Map<string, { repassePercent: number }>,
  taxPercent: number,
): Map<string, RepasseByProfessional> {
  // Group items by attending professional
  const grouped = new Map<string, InvoiceItemForRepasse[]>()
  for (const item of items) {
    const profId = resolveAttendingProfId(item)
    const list = grouped.get(profId) || []
    list.push(item)
    grouped.set(profId, list)
  }

  const result = new Map<string, RepasseByProfessional>()

  for (const [profId, profItems] of grouped) {
    const prof = professionals.get(profId)
    if (!prof) continue

    // Group by invoice for line-item display
    const byInvoice = new Map<string, { patientName: string; total: number; count: number }>()
    for (const item of profItems) {
      const existing = byInvoice.get(item.invoiceId)
      if (existing) {
        existing.total += item.total
        existing.count++
      } else {
        byInvoice.set(item.invoiceId, {
          patientName: item.patientName,
          total: item.total,
          count: 1,
        })
      }
    }

    const lines: RepasseInvoiceLine[] = []
    for (const [invoiceId, data] of byInvoice) {
      const calc = calculateRepasse(data.total, taxPercent, prof.repassePercent)
      lines.push({
        ...calc,
        invoiceId,
        patientName: data.patientName,
        totalSessions: data.count,
      })
    }

    const summary = calculateRepasseSummary(lines)
    result.set(profId, { lines, summary })
  }

  return result
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
