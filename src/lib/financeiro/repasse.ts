export interface RepasseCalc {
  grossValue: number
  taxAmount: number
  afterTax: number
  repasseValue: number
}

export interface RepasseInvoiceLine extends RepasseCalc {
  invoiceId: string
  patientName: string
  totalSessions: number
  /** Cash already reconciled for this line's share of the invoice. */
  paidAmount: number
  /** paidAmount / grossValue as a 0–100 percentage (rounded to 1 decimal). */
  percentPaid: number
}

export interface RepasseSummary {
  totalInvoices: number
  totalSessions: number
  totalGross: number
  totalTax: number
  totalAfterTax: number
  totalRepasse: number
  totalReceived: number
  percentReceived: number
}

export interface RepasseByProfessional {
  lines: RepasseInvoiceLine[]
  summary: RepasseSummary
}

/** One invoice's items + credit origins, used to compute per-professional gross. */
export interface InvoiceBreakdownInput {
  invoiceId: string
  invoiceProfessionalId: string
  patientName: string
  invoiceTotalAmount: number
  invoiceTotalSessions: number
  items: Array<{
    total: number
    isCredit: boolean
    attendingProfessionalId: string | null
  }>
  /** Originating professional for each consumed SessionCredit (one entry per credit). */
  creditOriginatingProfessionalIds: string[]
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

/** Professional's share of an invoice's reconciled cash. */
function computePaid(
  gross: number,
  invoicePaid: number,
  invoiceTotal: number,
): { paidAmount: number; percentPaid: number } {
  if (gross <= 0 || invoicePaid <= 0 || invoiceTotal <= 0) {
    return { paidAmount: 0, percentPaid: 0 }
  }
  const ratio = Math.min(invoicePaid / invoiceTotal, 1)
  const paidAmount = round2(gross * ratio)
  const percentPaid = gross === 0 ? 0 : Math.round((paidAmount / gross) * 1000) / 10
  return { paidAmount, percentPaid }
}

/** Who takes the repasse hit for an item — the attending professional, or the invoice owner as fallback. */
function itemProfId(
  item: { attendingProfessionalId: string | null },
  invoiceProfessionalId: string,
): string {
  return item.attendingProfessionalId ?? invoiceProfessionalId
}

/**
 * Per-professional breakdown for a single invoice.
 *
 *   gross_p = Σ(items attended by p)  +  Σ(credits originating from p)
 *
 * Items with attendingProfessionalId == null fall back to the invoice owner.
 * Credits are attributed to the SessionCredit's originating professional
 * (because a credit represents one of their cancelled sessions). If the credit
 * item count exceeds the originating-prof info we have, excess credits fall
 * back to the invoice owner. Sessions are split pro-rata by non-credit share.
 *
 * Sum of all per-prof grosses == invoice.totalAmount.
 */
export function computeInvoiceBreakdown(
  input: InvoiceBreakdownInput,
): Array<{ professionalProfileId: string; grossValue: number; totalSessions: number }> {
  const nonCreditByProf = new Map<string, number>()
  const nonCreditCountByProf = new Map<string, number>()
  let totalNonCredit = 0
  let totalNonCreditCount = 0
  const creditItems: number[] = []

  for (const item of input.items) {
    if (item.isCredit) {
      creditItems.push(item.total)
      continue
    }
    const profId = itemProfId(item, input.invoiceProfessionalId)
    nonCreditByProf.set(profId, (nonCreditByProf.get(profId) ?? 0) + item.total)
    nonCreditCountByProf.set(profId, (nonCreditCountByProf.get(profId) ?? 0) + 1)
    totalNonCredit += item.total
    totalNonCreditCount += 1
  }

  // Attribute each credit item to an originating professional. If we have fewer
  // origin IDs than credit items, extras fall back to the invoice owner.
  const creditByProf = new Map<string, number>()
  for (let i = 0; i < creditItems.length; i++) {
    const profId =
      input.creditOriginatingProfessionalIds[i] ?? input.invoiceProfessionalId
    creditByProf.set(profId, (creditByProf.get(profId) ?? 0) + creditItems[i])
  }

  // All profs that appear anywhere (either attended something or lost a credit).
  const allProfs = new Set<string>([
    ...nonCreditByProf.keys(),
    ...creditByProf.keys(),
  ])

  const out: Array<{ professionalProfileId: string; grossValue: number; totalSessions: number }> = []
  for (const profId of allProfs) {
    const nonCredit = nonCreditByProf.get(profId) ?? 0
    const credit = creditByProf.get(profId) ?? 0
    const share = totalNonCredit > 0 ? nonCredit / totalNonCredit : 0
    const sessions =
      allProfs.size === 1
        ? input.invoiceTotalSessions
        : totalNonCreditCount > 0
          ? Math.round(input.invoiceTotalSessions * (nonCreditCountByProf.get(profId) ?? 0) / totalNonCreditCount)
          : 0
    void share
    out.push({
      professionalProfileId: profId,
      grossValue: round2(nonCredit + credit),
      totalSessions: sessions,
    })
  }
  return out
}

/**
 * Build per-professional repasse lines from a set of invoices, each with its
 * own item-level breakdown. Uses the exact numbers from the invoice items so
 * the clinic sees "what this professional actually worked on this invoice".
 */
export function buildRepasseFromInvoices(
  invoices: InvoiceBreakdownInput[],
  professionals: Map<string, { repassePercent: number }>,
  taxPercent: number,
  invoicePaidAmounts: Map<string, number> = new Map(),
): Map<string, RepasseByProfessional> {
  const linesByProf = new Map<string, RepasseInvoiceLine[]>()
  for (const inv of invoices) {
    const breakdown = computeInvoiceBreakdown(inv)
    const invoicePaid = invoicePaidAmounts.get(inv.invoiceId) ?? 0
    for (const entry of breakdown) {
      const prof = professionals.get(entry.professionalProfileId)
      if (!prof) continue
      const calc = calculateRepasse(entry.grossValue, taxPercent, prof.repassePercent)
      const list = linesByProf.get(entry.professionalProfileId) ?? []
      list.push({
        ...calc,
        invoiceId: inv.invoiceId,
        patientName: inv.patientName,
        totalSessions: entry.totalSessions,
        ...computePaid(entry.grossValue, invoicePaid, inv.invoiceTotalAmount),
      })
      linesByProf.set(entry.professionalProfileId, list)
    }
  }

  const result = new Map<string, RepasseByProfessional>()
  for (const [profId, lines] of linesByProf) {
    result.set(profId, { lines, summary: calculateRepasseSummary(lines) })
  }
  return result
}

export function calculateRepasseSummary(lines: RepasseInvoiceLine[]): RepasseSummary {
  let totalGross = 0, totalTax = 0, totalAfterTax = 0, totalRepasse = 0
  let totalSessions = 0, totalReceived = 0

  for (const line of lines) {
    totalGross += line.grossValue
    totalTax += line.taxAmount
    totalAfterTax += line.afterTax
    totalRepasse += line.repasseValue
    totalSessions += line.totalSessions
    totalReceived += line.paidAmount
  }

  const roundedGross = round2(totalGross)
  const roundedReceived = round2(totalReceived)
  const percentReceived =
    roundedGross === 0 ? 0 : Math.round((roundedReceived / roundedGross) * 1000) / 10

  return {
    totalInvoices: lines.length,
    totalSessions,
    totalGross: roundedGross,
    totalTax: round2(totalTax),
    totalAfterTax: round2(totalAfterTax),
    totalRepasse: round2(totalRepasse),
    totalReceived: roundedReceived,
    percentReceived,
  }
}
