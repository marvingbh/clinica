import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "./invoice-template"
import { getMonthName, formatCurrencyBRL } from "./format"

function formatDateBR(date: Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}/${month}`
}

/**
 * Builds an item description that always includes the session date for detalhes.
 * If the stored description already has a date (e.g. "Sessão - 01/03"), use it as-is.
 * Otherwise append the date from the linked appointment.
 */
function descriptionWithDate(description: string, appointmentDate: Date | null): string {
  if (!appointmentDate) return description
  // If description already contains a date pattern like "- DD/MM", keep as-is
  if (/\d{2}\/\d{2}/.test(description)) return description
  return `${description} - ${formatDateBR(appointmentDate)}`
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
  },
  clinicTemplate: string | null,
  profName: string,
) {
  const allItems = await tx.invoiceItem.findMany({
    where: { invoiceId },
    include: {
      appointment: { select: { scheduledAt: true } },
    },
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

  // For detalhes, always include session dates
  const detalhes = buildDetailBlock(
    allItems.map((i: { description: string; total: number; type: string; appointment?: { scheduledAt: Date } | null }) => ({
      description: descriptionWithDate(i.description, i.appointment?.scheduledAt ?? null),
      total: formatCurrencyBRL(Number(i.total)),
      type: i.type,
    })),
    { grouped: true }
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
    vencimento: invoice.dueDate.toLocaleDateString("pt-BR"),
    sessoes: String(totalSessions),
    profissional: profName,
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
