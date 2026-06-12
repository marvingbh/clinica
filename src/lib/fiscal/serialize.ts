import { formatCpf } from "./cpf"
import type { DmedReport, FiscalIssue, ReciboRow } from "./types"
import type { EmissionStatusSnapshot } from "./view-types"

/** JSON-friendly shape of a ReciboRow for the API response. Dates as ISO date strings. */
export interface ReciboRowView {
  paymentKey: string
  invoiceId: string
  reconciliationLinkId: string | null
  paymentDate: string | null
  amount: number
  patientId: string
  professionalProfileId: string
  professionalName: string
  beneficiaryName: string
  beneficiaryCpf: string | null
  payerName: string
  payerCpf: string | null
  blockers: string[]
  refundWarning: boolean
  fullyRefunded: boolean
  status: EmissionStatusSnapshot | null
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

export function serializeReciboRow(
  row: ReciboRow,
  status: EmissionStatusSnapshot | null
): ReciboRowView {
  return {
    paymentKey: row.paymentKey,
    invoiceId: row.invoiceId,
    reconciliationLinkId: row.reconciliationLinkId,
    paymentDate: isoDate(row.paymentDate),
    amount: row.amount,
    patientId: row.patientId,
    professionalProfileId: row.professionalProfileId,
    professionalName: row.professional.name,
    beneficiaryName: row.beneficiary.name,
    beneficiaryCpf: row.beneficiary.cpf ? formatCpf(row.beneficiary.cpf) : null,
    payerName: row.payer.name,
    payerCpf: row.payer.cpf ? formatCpf(row.payer.cpf) : null,
    blockers: row.blockers,
    refundWarning: row.refundWarning,
    fullyRefunded: row.fullyRefunded,
    status,
  }
}

export function serializeIssue(issue: FiscalIssue): Record<string, unknown> {
  if (issue.kind === "SEM_ORIGEM") {
    return { ...issue, date: isoDate(issue.date) }
  }
  return { ...issue }
}

/** JSON-friendly DMED report: CPFs formatted, birth dates as ISO date strings. */
export function serializeDmedReport(report: DmedReport): Record<string, unknown> {
  return {
    year: report.year,
    grandTotal: report.grandTotal,
    ledgerTotal: report.ledgerTotal,
    unexplainedDiff: report.unexplainedDiff,
    payers: report.payers.map((p) => ({
      cpf: formatCpf(p.cpf),
      name: p.name,
      total: p.total,
      beneficiaries: p.beneficiaries.map((b) => ({
        cpf: formatCpf(b.cpf),
        name: b.name,
        birthDate: isoDate(b.birthDate),
        total: b.total,
      })),
    })),
  }
}
