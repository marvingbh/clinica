import { AppointmentForInvoice, classifyAppointments, calculateInvoiceTotals, InvoiceItemData } from "./invoice-generator"
import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "./invoice-template"
import { getMonthName, formatCurrencyBRL, formatDateBR, formatDateShort } from "./format"
import { shouldSkipInvoice } from "./invoice-generation"
import { recalculateInvoice } from "./recalculate-invoice"

export interface PerSessionInvoiceParams {
  clinicId: string
  patientId: string
  profId: string
  month: number
  year: number
  appointments: AppointmentForInvoice[]
  sessionFee: number
  patientTemplate: string | null
  clinicTemplate: string | null
  clinicPaymentInfo: string | null
  profName: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  showAppointmentDays: boolean
}

interface GenerationResult {
  generated: number
  updated: number
  skipped: number
}

/**
 * Generates one invoice per appointment (PER_SESSION strategy).
 * Each billable appointment gets its own invoice instead of being grouped monthly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePerSessionInvoices(
  tx: any,
  params: PerSessionInvoiceParams,
): Promise<GenerationResult> {
  const {
    clinicId, patientId, profId, month, year,
    sessionFee, patientTemplate, clinicTemplate,
    profName, patientName, motherName, fatherName,
    showAppointmentDays,
  } = params

  const sorted = [...params.appointments].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )

  // Cancel existing MONTHLY/MANUAL invoices that are still PENDENTE for this patient+month.
  // This handles the transition when a patient switches from MONTHLY to PER_SESSION grouping.
  const conflictingInvoices = await tx.invoice.findMany({
    where: {
      clinicId,
      patientId,
      professionalProfileId: profId,
      referenceMonth: month,
      referenceYear: year,
      invoiceType: { not: "PER_SESSION" },
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

  // Find all appointments already invoiced (any invoice type, any status except CANCELADO)
  const alreadyInvoiced = await tx.invoiceItem.findMany({
    where: {
      appointmentId: { in: sorted.map(a => a.id) },
      invoice: { status: { not: "CANCELADO" } },
    },
    select: { appointmentId: true, invoice: { select: { invoiceType: true } } },
  })
  const invoicedAptIds = new Set(
    alreadyInvoiced
      .filter((i: { invoice: { invoiceType: string } }) => i.invoice.invoiceType !== "PER_SESSION")
      .map((i: { appointmentId: string }) => i.appointmentId)
  )

  // Filter out appointments already billed on non-PER_SESSION invoices
  const available = sorted.filter(a => !invoicedAptIds.has(a.id))

  // Fetch unconsumed session credits for this patient (cross-professional)
  const unconsumedCredits = await tx.sessionCredit.findMany({
    where: { clinicId, patientId, consumedByInvoiceId: null },
    orderBy: { createdAt: "asc" },
  })
  let creditIndex = 0

  let generated = 0
  let updated = 0
  let skipped = 0

  for (const apt of available) {
    const result = await processAppointment(tx, apt, {
      clinicId, patientId, profId, month, year, sessionFee,
      patientTemplate, clinicTemplate, profName, patientName,
      motherName, fatherName, showAppointmentDays,
      unconsumedCredits, creditIndex,
    })

    if (result.outcome === "generated") generated++
    else if (result.outcome === "updated") updated++
    else skipped++

    creditIndex = result.creditIndex
  }

  return { generated, updated, skipped }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processAppointment(
  tx: any,
  apt: AppointmentForInvoice,
  ctx: {
    clinicId: string
    patientId: string
    profId: string
    month: number
    year: number
    sessionFee: number
    patientTemplate: string | null
    clinicTemplate: string | null
    profName: string
    patientName: string
    motherName: string | null
    fatherName: string | null
    showAppointmentDays: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unconsumedCredits: any[]
    creditIndex: number
  },
): Promise<{ outcome: "generated" | "updated" | "skipped"; creditIndex: number }> {
  let { creditIndex } = ctx

  // Check for existing PER_SESSION invoice for this appointment
  const existingItem = await tx.invoiceItem.findFirst({
    where: {
      appointmentId: apt.id,
      invoice: { invoiceType: "PER_SESSION", clinicId: ctx.clinicId },
    },
    select: { invoice: { select: { id: true, status: true } } },
  })

  if (existingItem) {
    return handleExistingInvoice(tx, apt, existingItem.invoice, ctx, creditIndex)
  }

  return createPerSessionInvoice(tx, apt, ctx, creditIndex)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleExistingInvoice(
  tx: any,
  apt: AppointmentForInvoice,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any,
  ctx: {
    sessionFee: number
    patientTemplate: string | null
    clinicTemplate: string | null
    profName: string
    patientName: string
    motherName: string | null
    fatherName: string | null
  },
  creditIndex: number,
): Promise<{ outcome: "updated" | "skipped"; creditIndex: number }> {
  if (shouldSkipInvoice(invoice.status)) {
    return { outcome: "skipped", creditIndex }
  }

  // Recalculate the existing invoice (price may have changed)
  await recalculateInvoice(
    tx,
    invoice.id,
    invoice,
    {
      name: ctx.patientName,
      motherName: ctx.motherName,
      fatherName: ctx.fatherName,
      sessionFee: ctx.sessionFee,
      invoiceMessageTemplate: ctx.patientTemplate,
    },
    ctx.clinicTemplate,
    ctx.profName,
  )

  return { outcome: "updated", creditIndex }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPerSessionInvoice(
  tx: any,
  apt: AppointmentForInvoice,
  ctx: {
    clinicId: string
    patientId: string
    profId: string
    month: number
    year: number
    sessionFee: number
    patientTemplate: string | null
    clinicTemplate: string | null
    profName: string
    patientName: string
    motherName: string | null
    fatherName: string | null
    showAppointmentDays: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unconsumedCredits: any[]
    creditIndex: number
  },
  creditIndex: number,
): Promise<{ outcome: "generated"; creditIndex: number }> {
  // Classify the single appointment to get the correct item type
  const classified = classifyAppointments([{ ...apt, price: apt.price ? Number(apt.price) : null }])

  // Determine item type and description from classification
  const itemType = getItemType(classified)
  const price = apt.price ?? ctx.sessionFee
  const aptDate = new Date(apt.scheduledAt)
  const description = buildItemDescription(itemType, apt, true)

  const items: InvoiceItemData[] = [{
    appointmentId: apt.id,
    type: itemType,
    description,
    quantity: 1,
    unitPrice: price,
    total: price,
    attendingProfessionalId: apt.attendingProfessionalId ?? null,
  }]

  // Apply credit if available
  if (creditIndex < ctx.unconsumedCredits.length) {
    const credit = ctx.unconsumedCredits[creditIndex]
    items.push({
      appointmentId: null,
      type: "CREDITO",
      description: `Crédito: ${credit.reason}`,
      quantity: -1,
      unitPrice: ctx.sessionFee,
      total: -ctx.sessionFee,
      creditId: credit.id,
    })
    creditIndex++
  }

  const totals = calculateInvoiceTotals(items)

  // Due date = appointment date (noon UTC to avoid timezone issues)
  const dueDate = new Date(Date.UTC(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate(), 12))

  // Use appointment's month/year for reference (may differ from params if appointment spans months)
  const refMonth = aptDate.getMonth() + 1
  const refYear = aptDate.getFullYear()

  const detalhes = buildDetailBlock(
    items.map(i => ({
      description: i.description,
      total: formatCurrencyBRL(i.total),
      type: i.type,
    })),
    { grouped: true },
  )

  const template = ctx.patientTemplate || ctx.clinicTemplate || DEFAULT_INVOICE_TEMPLATE
  const messageBody = renderInvoiceTemplate(template, {
    paciente: ctx.patientName,
    mae: ctx.motherName || "",
    pai: ctx.fatherName || "",
    valor: formatCurrencyBRL(totals.totalAmount),
    mes: getMonthName(refMonth),
    ano: String(refYear),
    vencimento: formatDateBR(dueDate.toISOString()),
    sessoes: String(totals.totalSessions),
    profissional: ctx.profName,
    sessoes_regulares: String(classified.regular.length),
    sessoes_extras: String(classified.extra.length),
    sessoes_grupo: String(classified.group.length),
    reunioes_escola: String(classified.schoolMeeting.length),
    creditos: String(totals.creditsApplied),
    valor_sessao: formatCurrencyBRL(ctx.sessionFee),
    detalhes,
  })

  const isAutoPaid = totals.totalAmount <= 0
  const now = new Date()

  const invoice = await tx.invoice.create({
    data: {
      clinicId: ctx.clinicId,
      professionalProfileId: ctx.profId,
      patientId: ctx.patientId,
      referenceMonth: refMonth,
      referenceYear: refYear,
      invoiceType: "PER_SESSION",
      totalSessions: totals.totalSessions,
      creditsApplied: totals.creditsApplied,
      extrasAdded: totals.extrasAdded,
      totalAmount: totals.totalAmount,
      dueDate,
      status: isAutoPaid ? "PAGO" : "PENDENTE",
      paidAt: isAutoPaid ? now : null,
      showAppointmentDays: ctx.showAppointmentDays,
      messageBody,
      items: {
        create: items.map(item => ({
          appointmentId: item.appointmentId,
          attendingProfessionalId: item.attendingProfessionalId ?? null,
          type: item.type,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      },
    },
  })

  // Mark consumed credits
  const creditItems = items.filter(i => i.type === "CREDITO" && i.creditId)
  for (const ci of creditItems) {
    await tx.sessionCredit.update({
      where: { id: ci.creditId! },
      data: { consumedByInvoiceId: invoice.id, consumedAt: now },
    })
  }

  return { outcome: "generated", creditIndex }
}

function getItemType(
  classified: ReturnType<typeof classifyAppointments>,
): InvoiceItemData["type"] {
  if (classified.group.length > 0) return "SESSAO_GRUPO"
  if (classified.schoolMeeting.length > 0) return "REUNIAO_ESCOLA"
  if (classified.extra.length > 0) return "SESSAO_EXTRA"
  return "SESSAO_REGULAR"
}

function buildItemDescription(
  type: InvoiceItemData["type"],
  apt: AppointmentForInvoice,
  showDate: boolean,
): string {
  const dateStr = showDate ? ` - ${formatDateShort(apt.scheduledAt)}` : ""
  switch (type) {
    case "SESSAO_REGULAR": return `Sessão${dateStr}`
    case "SESSAO_EXTRA": return `Sessão extra${dateStr}`
    case "SESSAO_GRUPO": return `Sessão grupo${dateStr}`
    case "REUNIAO_ESCOLA": return `${apt.title || "Reunião escola"}${dateStr}`
    default: return `Item${dateStr}`
  }
}
