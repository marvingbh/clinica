// Domain types for the fiscal compliance pack (Receita Saúde + DMED).
// All Prisma Decimals are converted to `number` at the route boundary before
// any of these types are constructed — the domain never touches Prisma.Decimal.

export type FiscalRegimeValue = "PF" | "PJ"

export type ReciboStatusValue = "EXPORTADO" | "EMITIDO" | "ERRO" | "CANCELADO"

/** A single paid installment — one Receita Saúde receipt per event. */
export interface PaymentEvent {
  /** Stable identity: "recl:<reconciliationLinkId>" | "inv:<invoiceId>". */
  paymentKey: string
  invoiceId: string
  reconciliationLinkId: string | null
  /** null => PAGAMENTO_SEM_DATA blocker (PAGO without paidAt). */
  paymentDate: Date | null
  amount: number
  patientId: string
  professionalProfileId: string
  /** Σ TransactionRefundLink on the backing credit transaction. */
  refundedAmount: number
}

export type ReciboBlocker =
  | "BENEFICIARIO_SEM_CPF"
  | "BENEFICIARIO_SEM_NASCIMENTO"
  | "PAGADOR_SEM_CPF"
  | "PROFISSIONAL_SEM_CPF"
  | "PROFISSIONAL_SEM_CRP"
  | "PAGAMENTO_SEM_DATA"
  | "VALOR_INVALIDO"

export interface ReciboParty {
  cpf: string | null
  name: string
  birthDate: Date | null
}

export interface ReciboRow extends PaymentEvent {
  beneficiary: ReciboParty
  payer: ReciboParty
  professional: ProfessionalFiscalData
  blockers: ReciboBlocker[]
  /** 0 < refundedAmount < amount — needs manual review before emitting. */
  refundWarning: boolean
  /** refundedAmount >= amount - 0.01 — excluded from export. */
  fullyRefunded: boolean
}

/** Patient fields the domain needs to resolve beneficiary + payer parties. */
export interface PatientFiscalData {
  id: string
  name: string
  cpf: string | null
  birthDate: Date | null
  billingCpf: string | null
  billingResponsibleName: string | null
}

/** Professional fields the domain needs (CRP lives in registrationNumber). */
export interface ProfessionalFiscalData {
  id: string
  name: string
  cpf: string | null
  crp: string | null
  fiscalRegime: FiscalRegimeValue | null
  fiscalRegimeSince: Date | null
}

// ---------------------------------------------------------------------------
// Receita Saúde batch file
// ---------------------------------------------------------------------------

export interface ReciboIssuer {
  cpf: string
  crp: string
  name: string
}

/** A ReciboRow with no blockers, ready for the batch file. */
export interface ExportableRecibo {
  paymentKey: string
  paymentDate: Date
  amount: number
  beneficiaryCpf: string
  beneficiaryName: string
  beneficiaryBirthDate: Date
  payerCpf: string
  payerName: string
}

export interface ReciboResultLine {
  /** Resolved via the line reference embedded at export (the paymentKey). */
  paymentKey: string | null
  outcome: "EMITIDO" | "ERRO"
  reciboNumero?: string
  message?: string
}

// ---------------------------------------------------------------------------
// DMED
// ---------------------------------------------------------------------------

export interface DmedBeneficiary {
  cpf: string
  name: string
  birthDate: Date | null
  total: number
}

export interface DmedPayerEntry {
  cpf: string
  name: string
  total: number
  /** Only populated when the payer differs from the beneficiary. */
  beneficiaries: DmedBeneficiary[]
}

export interface DmedReport {
  year: number
  payers: DmedPayerEntry[]
  grandTotal: number
  /** Σ all payment events in the year (PJ window), including blocked ones. */
  ledgerTotal: number
  /** ledgerTotal − grandTotal (amounts that could not be aggregated). */
  unexplainedDiff: number
}

export interface DmedConfig {
  cnpj: string
  nomeEmpresarial: string
  responsavelCpf: string
  responsavelNome: string
  responsavelDdd: string | null
  responsavelTelefone: string | null
}

// ---------------------------------------------------------------------------
// Pending issues ("sem origem" bucket + divergences)
// ---------------------------------------------------------------------------

export interface UnallocatedCredit {
  transactionId: string
  date: Date
  amount: number
  payerName: string | null
}

export interface PartialInvoiceInfo {
  invoiceId: string
  patientName: string
  amount: number
}

export type FiscalIssue =
  | { kind: "SEM_ORIGEM"; transactionId: string; date: Date; amount: number; payerName: string | null }
  | { kind: "PARCIAL_SEM_DETALHE"; invoiceId: string; patientName: string; amount: number }
  | {
      kind: "BLOQUEIO"
      paymentKey: string
      blockers: ReciboBlocker[]
      patientId: string
      patientName: string
    }

/** Thrown by parsers when an uploaded RFB result file cannot be interpreted. */
export class FiscalParseError extends Error {
  constructor(message = "Não foi possível interpretar o arquivo de resultado") {
    super(message)
    this.name = "FiscalParseError"
  }
}
