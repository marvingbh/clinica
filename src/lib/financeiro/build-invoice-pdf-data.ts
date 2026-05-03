import { formatCurrencyBRL, formatDateBR } from "./format"
import { getAttributionLayout, enrichItemDescription } from "./professional-attribution"
import type { InvoicePDFData, InvoicePDFItem, InvoicePDFItemSection } from "./invoice-pdf"

function splitHeaderLine(headerLine: string | null): {
  referenceProfessionalLabel: string | null
  referenceProfessionalName: string | null
} {
  if (!headerLine) {
    return { referenceProfessionalLabel: null, referenceProfessionalName: null }
  }
  const idx = headerLine.indexOf(": ")
  if (idx === -1) {
    return { referenceProfessionalLabel: headerLine, referenceProfessionalName: null }
  }
  return {
    referenceProfessionalLabel: headerLine.slice(0, idx),
    referenceProfessionalName: headerLine.slice(idx + 2),
  }
}

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
    type: string
    appointmentId: string | null
    attendingProfessionalId: string | null
    appointment: { scheduledAt: Date; group?: { name: string } | null } | null
    attendingProfessional?: { user: { name: string } } | null
  }>
}

export function buildInvoicePDFData(invoice: InvoiceWithRelations): InvoicePDFData {
  const sortedItems = [...invoice.items].sort((a, b) => {
    const dateA = a.appointment?.scheduledAt ? new Date(a.appointment.scheduledAt).getTime() : Number.POSITIVE_INFINITY
    const dateB = b.appointment?.scheduledAt ? new Date(b.appointment.scheduledAt).getTime() : Number.POSITIVE_INFINITY
    return dateA - dateB
  })

  const layout = getAttributionLayout({
    items: sortedItems.map(it => ({
      appointmentId: it.appointmentId,
      type: it.type,
      attendingProfessionalId: it.attendingProfessionalId,
      attendingProfessionalName: it.attendingProfessional?.user.name ?? null,
    })),
    referenceProfessionalName: invoice.patient.referenceProfessional?.user.name ?? null,
    invoiceProfessionalName: invoice.professionalProfile.user.name,
  })

  // Map original items to render rows once, then assemble into the layout
  // sections (avoids reformatting the same row twice).
  const renderedById = new Map<string, InvoicePDFItem>()
  const indexById = new Map<string, number>()
  sortedItems.forEach((item, idx) => {
    const key = item.appointmentId ?? `__manual_${idx}`
    indexById.set(key, idx)
    renderedById.set(key, {
      description: enrichItemDescription(
        {
          type: item.type,
          baseDescription: item.description,
          groupName: item.appointment?.group?.name ?? null,
        },
        { includeGroupName: true },
      ),
      date: item.appointment?.scheduledAt
        ? new Date(item.appointment.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : undefined,
      quantity: item.quantity,
      unitPrice: formatCurrencyBRL(Number(item.unitPrice)),
      total: formatCurrencyBRL(Number(item.total)),
      type: item.type,
    })
  })

  const itemSections: InvoicePDFItemSection[] = layout.sections.map(section => {
    // Each section contains a subset of sortedItems referenced by appointmentId
    // (or null for manual rows). Re-derive their rendered rows by looking up
    // the source items by their identity.
    const rows: InvoicePDFItem[] = []
    let manualIdx = 0
    for (const li of section.items) {
      const key = li.appointmentId ?? null
      if (key !== null) {
        const r = renderedById.get(key)
        if (r) rows.push(r)
      } else {
        // Manual rows: walk sortedItems to find unmatched manual rows in the
        // same order they appear inside this section.
        const sourceIdxStart = manualIdx
        for (let i = sourceIdxStart; i < sortedItems.length; i++) {
          if (sortedItems[i].appointmentId !== null) continue
          if (sortedItems[i].type !== li.type) continue
          const renderedKey = `__manual_${i}`
          const r = renderedById.get(renderedKey)
          if (r) {
            rows.push(r)
            manualIdx = i + 1
            break
          }
        }
      }
    }
    return { header: section.header, items: rows }
  })

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
    ...splitHeaderLine(layout.headerLine),
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
