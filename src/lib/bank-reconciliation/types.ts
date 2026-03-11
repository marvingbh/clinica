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
  remainingAmount: number  // totalAmount - sum(linked payments)
  referenceMonth: number
  referenceYear: number
  status: string
}

export type MatchConfidence = "KNOWN" | "HIGH" | "MEDIUM" | "LOW"

export interface MatchCandidate {
  invoice: InvoiceForMatching
  confidence: MatchConfidence
  nameScore: number // 0-2 (2.0 for KNOWN, 0-1 for name similarity)
  matchedField: string | null // "usualPayer", "motherName", "fatherName", "patientName", "patientSurname", or null
}

export interface MatchResult {
  transaction: TransactionForMatching
  candidates: MatchCandidate[] // sorted by confidence desc, nameScore desc
}
