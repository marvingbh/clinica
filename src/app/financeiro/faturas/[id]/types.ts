export interface InvoiceItem {
  id: string
  type: string
  description: string
  quantity: number
  unitPrice: string
  total: string
  appointment: { id: string; scheduledAt: string; status: string } | null
}

export interface InvoiceDetail {
  id: string
  referenceMonth: number
  referenceYear: number
  status: string
  totalSessions: number
  creditsApplied: number
  extrasAdded: number
  totalAmount: string
  dueDate: string
  paidAt: string | null
  notes: string | null
  messageBody: string | null
  notaFiscalEmitida: boolean
  notaFiscalEmitidaAt: string | null
  hasNotaFiscalPdf: boolean
  patient: { id: string; name: string; phone: string; motherName: string | null; sessionFee: string | null }
  professionalProfile: { id: string; user: { name: string } }
  items: InvoiceItem[]
  consumedCredits: Array<{ id: string; reason: string; createdAt: string }>
}
