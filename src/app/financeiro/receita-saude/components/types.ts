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
  status: {
    status: "EXPORTADO" | "EMITIDO" | "ERRO" | "CANCELADO"
    reciboNumero: string | null
    erro: string | null
    batchId: string
  } | null
}

export type FiscalIssueView =
  | { kind: "SEM_ORIGEM"; transactionId: string; date: string | null; amount: number; payerName: string | null }
  | { kind: "PARCIAL_SEM_DETALHE"; invoiceId: string; patientName: string; amount: number }
  | { kind: "BLOQUEIO"; paymentKey: string; blockers: string[]; patientId: string; patientName: string }

export interface FiscalProfessionalView {
  id: string
  name: string
  fiscalRegime: "PF" | "PJ" | null
  hasCpf: boolean
  hasCrp: boolean
}

export interface BatchView {
  id: string
  fileName: string
  itemCount: number
  totalAmount: number
  resultUploadedAt: string | null
  createdAt: string
  professionalName: string
  counts: Record<string, number>
  aggregateStatus: "AGUARDANDO" | "PROCESSADO" | "COM_ERROS"
}
