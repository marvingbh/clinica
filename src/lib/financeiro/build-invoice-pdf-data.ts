import { formatCurrencyBRL } from "./format"
import type { InvoicePDFData } from "./invoice-pdf"

/** Invoice with the relations needed for PDF generation (Prisma query result shape). */
export interface InvoiceWithRelations {
  referenceMonth: number
  referenceYear: number
  status: string
  totalSessions: number
  creditsApplied: number
  totalAmount: unknown // Prisma Decimal
  dueDate: Date | string
  clinic: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
    paymentInfo: string | null
  }
  patient: { name: string }
  professionalProfile: { user: { name: string } }
  items: Array<{
    description: string
    quantity: number
    unitPrice: unknown // Prisma Decimal
    total: unknown // Prisma Decimal
    type: string
    appointment: { scheduledAt: Date } | null
  }>
}

export function buildInvoicePDFData(invoice: InvoiceWithRelations): InvoicePDFData {
  return {
    clinicName: invoice.clinic.name,
    clinicPhone: invoice.clinic.phone || undefined,
    clinicEmail: invoice.clinic.email || undefined,
    clinicAddress: invoice.clinic.address || undefined,
    patientName: invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
    professionalName: invoice.professionalProfile.user.name,
    referenceMonth: invoice.referenceMonth,
    referenceYear: invoice.referenceYear,
    status: invoice.status,
    dueDate: new Date(invoice.dueDate).toLocaleDateString("pt-BR"),
    totalAmount: formatCurrencyBRL(Number(invoice.totalAmount)),
    totalSessions: invoice.totalSessions,
    creditsApplied: invoice.creditsApplied,
    paymentInfo: invoice.clinic.paymentInfo,
    items: [...invoice.items].sort((a, b) => {
      const dateA = a.appointment?.scheduledAt ? new Date(a.appointment.scheduledAt).getTime() : 0
      const dateB = b.appointment?.scheduledAt ? new Date(b.appointment.scheduledAt).getTime() : 0
      return dateA - dateB
    }).map(item => ({
      description: item.description,
      date: item.appointment?.scheduledAt
        ? new Date(item.appointment.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : undefined,
      quantity: item.quantity,
      unitPrice: formatCurrencyBRL(Number(item.unitPrice)),
      total: formatCurrencyBRL(Number(item.total)),
      type: item.type,
    })),
  }
}
