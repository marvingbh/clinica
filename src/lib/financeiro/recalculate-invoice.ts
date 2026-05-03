import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "./invoice-template"
import { getMonthName, formatCurrencyBRL, formatDateBR as formatDateFull, formatDateShort } from "./format"
import { getAttributionLayout, enrichItemDescription } from "./professional-attribution"

/**
 * Builds an item description that always includes the session date for detalhes.
 * If the stored description already has a date (e.g. "Sessão - 01/03"), use it as-is.
 * Otherwise append the date from the linked appointment.
 */
function descriptionWithDate(description: string, appointmentDate: Date | null): string {
  if (!appointmentDate) return description
  // If description already contains a date pattern like "- DD/MM", keep as-is
  if (/\d{2}\/\d{2}/.test(description)) return description
  return `${description} - ${formatDateShort(appointmentDate)}`
}

/**
 * Recalculates invoice totals and regenerates the message body after items change.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalculateInvoice(
  tx: any,
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
  const allItems = await tx.invoiceItem.findMany({
    where: { invoiceId },
    include: {
      appointment: {
        select: {
          scheduledAt: true,
          group: { select: { name: true } },
        },
      },
      attendingProfessional: { select: { user: { select: { name: true } } } },
    },
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
  const layout = getAttributionLayout({
    items: allItems.map((i: {
      appointmentId: string | null
      type: string
      attendingProfessionalId: string | null
      attendingProfessional?: { user: { name: string } } | null
    }) => ({
      appointmentId: i.appointmentId,
      type: i.type,
      attendingProfessionalId: i.attendingProfessionalId,
      attendingProfessionalName: i.attendingProfessional?.user.name ?? null,
    })),
    referenceProfessionalName: patient.referenceProfessional?.user.name ?? null,
    invoiceProfessionalName: profName,
  })

  // For detalhes, always include session dates and the therapy group name
  // for SESSAO_GRUPO items. When the layout switched to multi-professional,
  // group items by attending professional and let the section headers carry
  // the name (no per-line "· Name" suffix to keep the message readable).
  const detalhes = buildDetailBlock(
    allItems.map((i: {
      description: string
      total: number | string
      type: string
      appointment?: { scheduledAt: Date | null; group?: { name: string } | null } | null
      attendingProfessional?: { user: { name: string } } | null
    }) => ({
      description: enrichItemDescription(
        {
          type: i.type,
          baseDescription: descriptionWithDate(i.description, i.appointment?.scheduledAt ?? null),
          groupName: i.appointment?.group?.name ?? null,
        },
        { includeGroupName: true },
      ),
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
    tecnico_referencia: layout.headerLine ?? "",
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
