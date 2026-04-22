export interface RepasseDetailData {
  year: number
  month: number
  taxPercent: number
  repassePercent: number
  professional: { id: string; name: string }
  summary: {
    totalInvoices: number
    totalSessions: number
    totalGross: number
    totalTax: number
    totalAfterTax: number
    totalRepasse: number
    totalReceived: number
    percentReceived: number
  }
  items: Array<{
    invoiceId: string
    patientName: string
    totalSessions: number
    grossValue: number
    taxAmount: number
    afterTax: number
    repasseValue: number
    paidAmount: number
    percentPaid: number
    slot: { dayOfWeek: number; time: string } | null
  }>
  payment: {
    paidAmount: number
    grossAmount: number
    taxAmount: number
    paidAt: string
    notes: string | null
  } | null
  adjustment: number
}
