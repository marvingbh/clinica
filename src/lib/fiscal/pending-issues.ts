import type {
  FiscalIssue,
  PartialInvoiceInfo,
  PatientFiscalData,
  ReciboRow,
  UnallocatedCredit,
} from "./types"

/**
 * Collects the divergences shown in the "Pendências" / "Sem origem" cards.
 *
 * - Each unallocated bank credit (already filtered to exclude dismissed ones
 *   by the caller) → SEM_ORIGEM.
 * - Each PARCIAL invoice without reconciliation links → PARCIAL_SEM_DETALHE
 *   (no per-installment date/amount, so no recibo can be built yet).
 * - Each row carrying blockers → BLOQUEIO with the patient name for the
 *   quick-fix link.
 */
export function collectPendingIssues(
  rows: ReciboRow[],
  unallocatedCredits: UnallocatedCredit[],
  partialInvoicesWithoutLinks: PartialInvoiceInfo[],
  patients: Map<string, PatientFiscalData>
): FiscalIssue[] {
  const issues: FiscalIssue[] = []

  for (const credit of unallocatedCredits) {
    issues.push({
      kind: "SEM_ORIGEM",
      transactionId: credit.transactionId,
      date: credit.date,
      amount: credit.amount,
      payerName: credit.payerName,
    })
  }

  for (const inv of partialInvoicesWithoutLinks) {
    issues.push({
      kind: "PARCIAL_SEM_DETALHE",
      invoiceId: inv.invoiceId,
      patientName: inv.patientName,
      amount: inv.amount,
    })
  }

  for (const row of rows) {
    if (row.blockers.length === 0) continue
    const patientName = patients.get(row.patientId)?.name ?? row.beneficiary.name
    issues.push({
      kind: "BLOQUEIO",
      paymentKey: row.paymentKey,
      blockers: row.blockers,
      patientId: row.patientId,
      patientName,
    })
  }

  return issues
}
