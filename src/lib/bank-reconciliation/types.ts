export interface TransactionForMatching {
  id: string
  date: Date
  amount: number // positive number
  description: string
  payerName: string | null
}

export interface InvoiceForMatching {
  id: string
  patientId: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  status: string // PENDENTE or ENVIADO
}

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW"

export interface MatchCandidate {
  invoice: InvoiceForMatching
  confidence: MatchConfidence
  nameScore: number // 0-1 similarity
  matchedField: string | null // "motherName", "fatherName", "patientName", or null
}

export interface MatchResult {
  transaction: TransactionForMatching
  candidates: MatchCandidate[] // sorted by confidence desc, nameScore desc
}
