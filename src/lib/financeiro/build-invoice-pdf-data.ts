import type { InvoiceItemType } from "@prisma/client"
import { formatCurrencyBRL, formatDateBR } from "./format"
import { getAttributionLayout } from "./professional-attribution"
import type { InvoicePDFData, InvoicePDFItem, InvoicePDFItemSection } from "./invoice-pdf"

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
    logoData: Uint8Array | null
    logoMime: string | null
  }
  patient: {
    name: string
    referenceProfessional?: { user: { name: string } } | null
  }
  professionalProfile: { user: { name: string } }
  items: Array<{
    description: string
    quantity: number
    unitPrice: unknown // Prisma Decimal
    total: unknown // Prisma Decimal
    type: InvoiceItemType
    appointmentId: string | null
    attendingProfessionalId: string | null
    appointment: { scheduledAt: Date } | null
    attendingProfessional?: { user: { name: string } } | null
  }>
}

export function buildInvoicePDFData(invoice: InvoiceWithRelations): InvoicePDFData {
  // Decorate each row with the attribution shape so the helper can return
  // sections that already contain the rendered rows — no second-pass lookups.
  const rows = invoice.items.map(item => ({
    type: item.type,
    attendingProfessionalId: item.attendingProfessionalId,
    attendingProfessionalName: item.attendingProfessional?.user.name ?? null,
    rendered: {
      description: item.description,
      date: item.appointment?.scheduledAt
        ? new Date(item.appointment.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : undefined,
      quantity: item.quantity,
      unitPrice: formatCurrencyBRL(Number(item.unitPrice)),
      total: formatCurrencyBRL(Number(item.total)),
      type: item.type,
    } satisfies InvoicePDFItem,
  }))

  const layout = getAttributionLayout({
    items: rows,
    referenceProfessionalName: invoice.patient.referenceProfessional?.user.name ?? null,
    invoiceProfessionalName: invoice.professionalProfile.user.name,
  })

  const itemSections: InvoicePDFItemSection[] = layout.sections.map(section => ({
    header: section.header,
    items: section.items.map(row => row.rendered),
  }))

  return {
    clinicName: invoice.clinic.name,
    clinicPhone: invoice.clinic.phone || undefined,
    clinicEmail: invoice.clinic.email || undefined,
    clinicAddress: invoice.clinic.address || undefined,
    logoSrc: invoice.clinic.logoData && (invoice.clinic.logoMime === "image/png" || invoice.clinic.logoMime === "image/jpeg")
      ? `data:${invoice.clinic.logoMime};base64,${Buffer.from(invoice.clinic.logoData).toString("base64")}`
      : undefined,
    patientName: invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
    professionalName: invoice.professionalProfile.user.name,
    referenceProfessionalLabel: layout.header?.label ?? null,
    referenceProfessionalName: layout.header?.name ?? null,
    referenceMonth: invoice.referenceMonth,
    referenceYear: invoice.referenceYear,
    status: invoice.status,
    dueDate: formatDateBR(typeof invoice.dueDate === "string" ? invoice.dueDate : invoice.dueDate.toISOString()),
    totalAmount: formatCurrencyBRL(Number(invoice.totalAmount)),
    totalSessions: invoice.totalSessions,
    creditsApplied: invoice.creditsApplied,
    paymentInfo: invoice.clinic.paymentInfo,
    itemSections,
  }
}
