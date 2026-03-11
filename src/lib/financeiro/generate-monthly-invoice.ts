import { classifyAppointments, buildInvoiceItems, buildMonthlyInvoiceItems, calculateInvoiceTotals } from "./invoice-generator"
import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "./invoice-template"
import { getMonthName, formatCurrencyBRL, formatDateBR } from "./format"
import { recalculateInvoice } from "./recalculate-invoice"
import { shouldSkipInvoice, separateManualItems } from "./invoice-generation"

export interface MonthlyInvoiceParams {
  clinicId: string
  patientId: string
  professionalProfileId: string
  month: number
  year: number
  dueDate: Date
  sessionFee: number
  showAppointmentDays: boolean
  profName: string
  billingMode: string | null
  patient: {
    name: string
    motherName: string | null
    fatherName: string | null
    invoiceMessageTemplate: string | null
  }
  clinicInvoiceMessageTemplate: string | null
  appointments: {
    id: string
    scheduledAt: Date
    status: string
    type: string
    title: string | null
    recurrenceId: string | null
    groupId: string | null
    price: number | null
  }[]
}

/**
 * Generates or updates a monthly invoice for a single patient+professional combination.
 * Extracted from the gerar route to enable reuse across invoice generation strategies.
 *
 * Returns "generated", "updated", or "skipped" to indicate what happened.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateMonthlyInvoice(
  tx: any,
  params: MonthlyInvoiceParams,
): Promise<"generated" | "updated" | "skipped"> {
  const {
    clinicId, patientId, professionalProfileId, month, year, dueDate,
    sessionFee, showAppointmentDays, profName, billingMode,
    patient, clinicInvoiceMessageTemplate, appointments: patientApts,
  } = params

  // Cancel existing PER_SESSION invoices that are still PENDENTE for this patient+month.
  // This handles the transition when a patient switches from PER_SESSION back to MONTHLY.
  const conflictingInvoices = await tx.invoice.findMany({
    where: {
      clinicId, patientId, professionalProfileId,
      referenceMonth: month, referenceYear: year,
      invoiceType: "PER_SESSION",
      status: "PENDENTE",
    },
    select: { id: true },
  })
  if (conflictingInvoices.length > 0) {
    const conflictingIds = conflictingInvoices.map((i: { id: string }) => i.id)
    // Release credits consumed by these invoices so they can be reused
    await tx.sessionCredit.updateMany({
      where: { consumedByInvoiceId: { in: conflictingIds } },
      data: { consumedByInvoiceId: null, consumedAt: null },
    })
    await tx.invoice.updateMany({
      where: { id: { in: conflictingIds } },
      data: { status: "CANCELADO" },
    })
  }

  // Check existing MONTHLY invoice
  const existing = await tx.invoice.findFirst({
    where: {
      clinicId, patientId, professionalProfileId,
      referenceMonth: month, referenceYear: year, invoiceType: "MONTHLY",
    },
    include: { items: true },
  })

  if (existing && shouldSkipInvoice(existing.status)) {
    return "skipped"
  }

  // Filter out appointments already invoiced in OTHER invoices (prevents double-billing)
  const existingItemAptIds = new Set(
    (existing?.items ?? []).map((i: { appointmentId: string | null }) => i.appointmentId).filter(Boolean)
  )
  const alreadyInvoiced = await tx.invoiceItem.findMany({
    where: {
      appointmentId: { in: patientApts.map(a => a.id) },
      invoice: { id: { not: existing?.id ?? "" } },
    },
    select: { appointmentId: true },
  })
  const invoicedElsewhereIds = new Set(alreadyInvoiced.map((i: { appointmentId: string }) => i.appointmentId))
  const availableApts = patientApts.filter(a =>
    !invoicedElsewhereIds.has(a.id) || existingItemAptIds.has(a.id)
  )

  const classified = classifyAppointments(
    availableApts.map(a => ({ ...a, price: a.price ? Number(a.price) : null }))
  )

  // SessionCredits: query by clinicId + patientId (cross-professional)
  const availableCredits = await tx.sessionCredit.findMany({
    where: { clinicId, patientId, consumedByInvoiceId: null },
    orderBy: { createdAt: "asc" },
  })

  let items
  if (billingMode === "MONTHLY_FIXED") {
    const totalSessionCount = classified.regular.length + classified.extra.length
      + classified.group.length + classified.schoolMeeting.length
    items = buildMonthlyInvoiceItems(
      sessionFee, totalSessionCount, getMonthName(month), String(year), availableCredits, sessionFee
    )
  } else {
    items = buildInvoiceItems(classified, sessionFee, availableCredits, showAppointmentDays)
  }

  if (existing) {
    return updateExistingInvoice(tx, existing, items, {
      dueDate, month, year, sessionFee, profName,
      patient, clinicInvoiceMessageTemplate,
    })
  }

  return createNewInvoice(tx, items, {
    clinicId, patientId, professionalProfileId, month, year, dueDate,
    sessionFee, showAppointmentDays, profName, billingMode,
    patient, clinicInvoiceMessageTemplate, classified, availableCredits,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateExistingInvoice(
  tx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existing: any,
  items: ReturnType<typeof buildInvoiceItems>,
  context: {
    dueDate: Date
    month: number
    year: number
    sessionFee: number
    profName: string
    patient: MonthlyInvoiceParams["patient"]
    clinicInvoiceMessageTemplate: string | null
  },
): Promise<"updated"> {
  const { dueDate, sessionFee, profName, patient, clinicInvoiceMessageTemplate } = context

  // Preserve manual items, notes, NF info, status
  const consumedCredits = await tx.sessionCredit.findMany({
    where: { consumedByInvoiceId: existing.id },
    select: { id: true, reason: true },
  })

  await tx.sessionCredit.updateMany({
    where: { consumedByInvoiceId: existing.id },
    data: { consumedByInvoiceId: null, consumedAt: null },
  })

  const { autoItems } = separateManualItems(existing.items, consumedCredits)
  if (autoItems.length > 0) {
    await tx.invoiceItem.deleteMany({
      where: { id: { in: autoItems.map((i: { id: string }) => i.id) } },
    })
  }

  // Create new auto items
  for (const item of items) {
    await tx.invoiceItem.create({
      data: {
        invoiceId: existing.id,
        appointmentId: item.appointmentId,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      },
    })
  }

  // Consume credits
  const creditItems = items.filter(i => i.type === "CREDITO" && i.creditId)
  for (const ci of creditItems) {
    await tx.sessionCredit.update({
      where: { id: ci.creditId! },
      data: { consumedByInvoiceId: existing.id, consumedAt: new Date() },
    })
  }

  // Update due date from clinic settings
  await tx.invoice.update({
    where: { id: existing.id },
    data: { dueDate },
  })

  // Recalculate totals (includes kept manual items)
  await recalculateInvoice(
    tx, existing.id, { ...existing, dueDate },
    { ...patient, sessionFee },
    clinicInvoiceMessageTemplate, profName,
  )

  return "updated"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createNewInvoice(
  tx: any,
  items: ReturnType<typeof buildInvoiceItems>,
  context: {
    clinicId: string
    patientId: string
    professionalProfileId: string
    month: number
    year: number
    dueDate: Date
    sessionFee: number
    showAppointmentDays: boolean
    profName: string
    billingMode: string | null
    patient: MonthlyInvoiceParams["patient"]
    clinicInvoiceMessageTemplate: string | null
    classified: ReturnType<typeof classifyAppointments>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    availableCredits: any[]
  },
): Promise<"generated"> {
  const {
    clinicId, patientId, professionalProfileId, month, year, dueDate,
    sessionFee, showAppointmentDays, profName, billingMode,
    patient, clinicInvoiceMessageTemplate, classified, availableCredits,
  } = context

  const totals = calculateInvoiceTotals(items)
  const detailItems = billingMode === "MONTHLY_FIXED"
    ? items
    : buildInvoiceItems(classified, sessionFee, availableCredits, true)
  const detalhes = buildDetailBlock(
    detailItems.map(i => ({
      description: i.description,
      total: formatCurrencyBRL(i.total),
      type: i.type,
    })),
    { grouped: true }
  )

  const template = patient.invoiceMessageTemplate
    || clinicInvoiceMessageTemplate
    || DEFAULT_INVOICE_TEMPLATE
  const messageBody = renderInvoiceTemplate(template, {
    paciente: patient.name,
    mae: patient.motherName || "",
    pai: patient.fatherName || "",
    valor: formatCurrencyBRL(totals.totalAmount),
    mes: getMonthName(month),
    ano: String(year),
    vencimento: formatDateBR(dueDate.toISOString()),
    sessoes: String(totals.totalSessions),
    profissional: profName,
    sessoes_regulares: String(classified.regular.length),
    sessoes_extras: String(classified.extra.length),
    sessoes_grupo: String(classified.group.length),
    reunioes_escola: String(classified.schoolMeeting.length),
    creditos: String(totals.creditsApplied),
    valor_sessao: formatCurrencyBRL(sessionFee),
    detalhes,
  })

  const invoice = await tx.invoice.create({
    data: {
      clinicId,
      professionalProfileId,
      patientId,
      referenceMonth: month,
      referenceYear: year,
      invoiceType: "MONTHLY",
      totalSessions: totals.totalSessions,
      creditsApplied: totals.creditsApplied,
      extrasAdded: totals.extrasAdded,
      totalAmount: totals.totalAmount,
      dueDate,
      showAppointmentDays: showAppointmentDays,
      messageBody,
      items: {
        create: items.map(item => ({
          appointmentId: item.appointmentId,
          type: item.type,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      },
    },
  })

  const creditItems = items.filter(i => i.type === "CREDITO" && i.creditId)
  for (const ci of creditItems) {
    await tx.sessionCredit.update({
      where: { id: ci.creditId! },
      data: { consumedByInvoiceId: invoice.id, consumedAt: new Date() },
    })
  }

  return "generated"
}
