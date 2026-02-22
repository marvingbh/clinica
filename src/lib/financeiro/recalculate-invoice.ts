import { renderInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE } from "./invoice-template"
import { getMonthName, formatCurrencyBRL } from "./format"

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
    invoiceMessageTemplate: string | null
  },
  clinicTemplate: string | null,
  profName: string,
) {
  const allItems = await tx.invoiceItem.findMany({
    where: { invoiceId },
  })

  let totalSessions = 0
  let creditsApplied = 0
  let extrasAdded = 0
  let totalAmount = 0

  for (const it of allItems) {
    totalAmount += Number(it.total)
    if (it.type === "CREDITO") {
      creditsApplied++
    } else if (it.type === "SESSAO_EXTRA" || it.type === "REUNIAO_ESCOLA") {
      extrasAdded += it.quantity
      totalSessions += it.quantity
    } else {
      totalSessions += it.quantity
    }
  }

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
  })

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { totalSessions, creditsApplied, extrasAdded, totalAmount, messageBody },
  })
}
