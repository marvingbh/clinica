import { stripCpf } from "./cpf"
import type {
  DmedBeneficiary,
  DmedPayerEntry,
  DmedReport,
  ReciboRow,
} from "./types"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function paymentYear(date: Date): number {
  // @db.Date — read the year from the ISO string (no timezone shift).
  return Number(date.toISOString().slice(0, 4))
}

/**
 * Aggregates rows into the DMED conference report for a calendar year.
 *
 * - Competence = payment date (a December session paid in January counts the
 *   following year).
 * - Groups by payer CPF. Beneficiaries are listed only when the payer differs
 *   from the beneficiary (payer CPF ≠ beneficiary CPF).
 * - Rows with blockers (or a null payment date, or full refund) are excluded
 *   from the payer totals but still counted into `ledgerTotal`, so
 *   `unexplainedDiff` exposes amounts that could not be aggregated.
 * - Payers are sorted by name; beneficiaries by name within each payer.
 */
export function aggregateDmed(rows: ReciboRow[], year: number): DmedReport {
  const inYear = rows.filter((r) => r.paymentDate && paymentYear(r.paymentDate) === year)

  let ledgerTotal = 0
  const payerMap = new Map<string, DmedPayerEntry>()
  const benefMap = new Map<string, Map<string, DmedBeneficiary>>()

  for (const row of inYear) {
    ledgerTotal = round2(ledgerTotal + row.amount)

    // Excluded from aggregation but already counted into the ledger above.
    if (row.blockers.length > 0 || row.fullyRefunded) continue

    const payerCpf = stripCpf(row.payer.cpf ?? "")
    const benefCpf = stripCpf(row.beneficiary.cpf ?? "")

    let payer = payerMap.get(payerCpf)
    if (!payer) {
      payer = { cpf: payerCpf, name: row.payer.name, total: 0, beneficiaries: [] }
      payerMap.set(payerCpf, payer)
      benefMap.set(payerCpf, new Map())
    }
    payer.total = round2(payer.total + row.amount)

    // List the beneficiary only when payer ≠ beneficiary.
    if (payerCpf !== benefCpf) {
      const benefs = benefMap.get(payerCpf)!
      let benef = benefs.get(benefCpf)
      if (!benef) {
        benef = {
          cpf: benefCpf,
          name: row.beneficiary.name,
          birthDate: row.beneficiary.birthDate,
          total: 0,
        }
        benefs.set(benefCpf, benef)
      }
      benef.total = round2(benef.total + row.amount)
    }
  }

  const payers = [...payerMap.values()].map((p) => ({
    ...p,
    beneficiaries: [...benefMap.get(p.cpf)!.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    ),
  }))
  payers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  const grandTotal = round2(payers.reduce((sum, p) => sum + p.total, 0))

  return {
    year,
    payers,
    grandTotal,
    ledgerTotal,
    unexplainedDiff: round2(ledgerTotal - grandTotal),
  }
}
