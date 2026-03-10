export interface CreatedInvoiceInfo {
  id: string
  patientName: string
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  description: string
}

export interface CandidateInvoice {
  invoiceId: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  totalAmount: number
  remainingAmount: number
  referenceMonth: number
  referenceYear: number
  status?: string
}

export interface Candidate extends CandidateInvoice {
  confidence: "HIGH" | "MEDIUM" | "LOW"
  nameScore: number
  matchedField: string | null
}

export interface GroupCandidate {
  invoices: CandidateInvoice[]
  sharedParent: string | null
}

export interface ReconciliationLinkInfo {
  linkId: string
  invoiceId: string
  patientName: string
  amount: number
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  status: string
}

export interface Transaction {
  id: string
  externalId: string
  date: string
  amount: number
  description: string
  payerName: string | null
  allocatedAmount: number
  remainingAmount: number
  isFullyReconciled: boolean
  links: ReconciliationLinkInfo[]
  candidates: Candidate[]
  groupCandidates?: GroupCandidate[]
}

export const INVOICE_STATUS_CONFIG: Record<string, { bg: string; label: string }> = {
  PENDENTE: { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pendente" },
  ENVIADO: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Enviado" },
  PARCIAL: { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: "Parcial" },
  PAGO: { bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "Pago" },
}

export const CONFIDENCE_CONFIG: Record<string, { bg: string; dot: string; label: string }> = {
  HIGH: {
    bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
    dot: "bg-green-500",
    label: "Alta",
  },
  MEDIUM: {
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
    dot: "bg-amber-500",
    label: "Média",
  },
  LOW: {
    bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
    dot: "bg-red-400",
    label: "Baixa",
  },
}

export function hasWordOverlap(name: string | null, payerName: string | null): boolean {
  if (!name || !payerName) return false
  const nameWords = name.toLowerCase().replace(/\([^)]*\)/g, "").split(/\s+/).filter(w => w.length > 2)
  const payerWords = payerName.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  return nameWords.some(w => payerWords.includes(w))
}

