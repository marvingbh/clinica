import { Prisma } from "@prisma/client"
import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "./invoice-template"
import { getMonthName, formatCurrencyBRL, formatDateBR as formatDateFull, formatDateShort } from "./format"
import { getAttributionLayout } from "./professional-attribution"

const itemInclude = {
  appointment: {
    select: {
      scheduledAt: true,
      group: { select: { name: true } },
    },
  },
  attendingProfessional: { select: { user: { select: { name: true } } } },
} as const satisfies Prisma.InvoiceItemInclude

type RecalcRow = Prisma.InvoiceItemGetPayload<{ include: typeof itemInclude }>

/**
 * Builds an item description that always includes the session date for detalhes.
 * If the stored description already has a date, use it as-is. Otherwise append
 * the date from the linked appointment.
 */
function descriptionWithDate(description: string, appointmentDate: Date | null): string {
  if (!appointmentDate) return description
  if (/\d{2}\/\d{2}/.test(description)) return description
  return `${description} - ${formatDateShort(appointmentDate)}`
}

/**
 * Recalculates invoice totals and regenerates the message body after items
 * change. Trusts the cached `InvoiceItem.description` — the generators
 * materialize the final string (including the therapy group name) at write
 * time, so no render-time rewrite happens here.
 */
export async function recalculateInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  invoice: {
    referenceMonth: number
    referenceYear: number
    dueDate: Date
    showAppointmentDays: boolean
  },
  patient: {
    name: string
    motherName: string | null
    fatherName: string | null
    sessionFee: number | { toNumber(): number } | null
    invoiceMessageTemplate: string | null
    referenceProfessional?: { user: { name: string } } | null
  },
  clinicTemplate: string | null,
  profName: string,
) {
  const allItems: RecalcRow[] = await tx.invoiceItem.findMany({
    where: { invoiceId },
    include: itemInclude,
    orderBy: [
      { appointment: { scheduledAt: "asc" } },
      { id: "asc" },
    ],
  })

  let totalSessions = 0
  let creditsApplied = 0
  let extrasAdded = 0
  let totalAmount = 0
  let regularCount = 0
  let extraCount = 0
  let groupCount = 0
  let schoolMeetingCount = 0

  for (const it of allItems) {
    totalAmount += Number(it.total)
    if (it.type === "CREDITO") {
      creditsApplied++
    } else {
      totalSessions += it.quantity
      if (it.type === "SESSAO_REGULAR") regularCount += it.quantity
      else if (it.type === "SESSAO_EXTRA") { extrasAdded += it.quantity; extraCount += it.quantity }
      else if (it.type === "SESSAO_GRUPO") groupCount += it.quantity
      else if (it.type === "REUNIAO_ESCOLA") { extrasAdded += it.quantity; schoolMeetingCount += it.quantity }
    }
  }

  const sessionFee = patient.sessionFee ? Number(patient.sessionFee) : 0

  // Decide layout based on distinct attending professionals on this invoice.
  const layoutItems = allItems.map(i => ({
    type: i.type,
    attendingProfessionalId: i.attendingProfessionalId,
    attendingProfessionalName: i.attendingProfessional?.user.name ?? null,
  }))
  const layout = getAttributionLayout({
    items: layoutItems,
    referenceProfessionalName: patient.referenceProfessional?.user.name ?? null,
    invoiceProfessionalName: profName,
  })

  const detalhes = buildDetailBlock(
    allItems.map(i => ({
      description: descriptionWithDate(i.description, i.appointment?.scheduledAt ?? null),
      total: formatCurrencyBRL(Number(i.total)),
      type: i.type,
      professionalName: i.attendingProfessional?.user.name ?? null,
    })),
    { grouped: true, groupBy: layout.mode === "multi" ? "professional" : "type" },
  )

  const template = patient.invoiceMessageTemplate
    || clinicTemplate
    || DEFAULT_INVOICE_TEMPLATE

  const messageBody = renderInvoiceTemplate(template, {
    paciente: patient.name,
    mae: patient.motherName || "",
    pai: patient.fatherName || "",
    valor: formatCurrencyBRL(totalAmount),
    mes: getMonthName(invoice.referenceMonth),
    ano: String(invoice.referenceYear),
    vencimento: formatDateFull(invoice.dueDate instanceof Date ? invoice.dueDate.toISOString() : String(invoice.dueDate)),
    sessoes: String(totalSessions),
    profissional: profName,
    tecnico_referencia: layout.header ? `${layout.header.label}: ${layout.header.name}` : "",
    sessoes_regulares: String(regularCount),
    sessoes_extras: String(extraCount),
    sessoes_grupo: String(groupCount),
    reunioes_escola: String(schoolMeetingCount),
    creditos: String(creditsApplied),
    valor_sessao: formatCurrencyBRL(sessionFee),
    detalhes,
  })

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { totalSessions, creditsApplied, extrasAdded, totalAmount, messageBody },
  })
}

/** @internal */
export const _internal = { descriptionWithDate }
