export interface DmedBeneficiaryView {
  cpf: string
  name: string
  birthDate: string | null
  total: number
}

export interface DmedPayerView {
  cpf: string
  name: string
  total: number
  beneficiaries: DmedBeneficiaryView[]
}

export interface DmedReportView {
  year: number
  grandTotal: number
  ledgerTotal: number
  unexplainedDiff: number
  payers: DmedPayerView[]
}

export type DmedIssueView =
  | { kind: "SEM_ORIGEM"; transactionId: string; date: string | null; amount: number; payerName: string | null }
  | { kind: "PARCIAL_SEM_DETALHE"; invoiceId: string; patientName: string; amount: number }
  | { kind: "BLOQUEIO"; paymentKey: string; blockers: string[]; patientId: string; patientName: string }
