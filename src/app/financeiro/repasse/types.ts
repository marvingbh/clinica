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
  }
  items: Array<{
    invoiceId: string
    patientName: string
    totalSessions: number
    grossValue: number
    taxAmount: number
    afterTax: number
    repasseValue: number
  }>
}
