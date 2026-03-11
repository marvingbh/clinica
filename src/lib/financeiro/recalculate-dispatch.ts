import { Prisma } from "@prisma/client"
import { recalculateInvoice } from "./recalculate-invoice"
import { generatePerSessionInvoices } from "./generate-per-session-invoices"
import { generateMonthlyInvoice } from "./generate-monthly-invoice"

type Tx = Prisma.TransactionClient

const PER_SESSION_BILLABLE_STATUSES = ["AGENDADO", "CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA"]

export interface RecalculatePerSessionParams {
  invoice: {
    id: string
    patientId: string
    professionalProfileId: string
    referenceMonth: number
    referenceYear: number
    dueDate: Date
    items: Array<{ id: string; appointmentId: string | null; type: string; description: string }>
  }
  patient: {
    name: string
    motherName: string | null
    fatherName: string | null
    sessionFee: { toNumber(): number } | number | null
    invoiceMessageTemplate: string | null
  }
  clinicId: string
}

/**
 * Recalculate a single PER_SESSION invoice.
 * Updates price to current sessionFee, applies available credit if none exists.
 * Cancels the invoice if the appointment is no longer billable.
 * Returns a result object describing what happened.
 */
export async function recalculatePerSession(
  tx: Tx,
  params: RecalculatePerSessionParams,
  clinicTemplate: string | null,
  profName: string,
): Promise<{ action: "recalculated" | "cancelled" | "noop"; message: string }> {
  const { invoice, patient, clinicId } = params

  const appointmentItem = invoice.items.find(
    i => i.appointmentId != null && i.type !== "CREDITO"
  )

  if (!appointmentItem) {
    return { action: "noop", message: "Fatura recalculada (sem item de sessão)" }
  }

  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentItem.appointmentId! },
    select: { id: true, status: true, price: true },
  })

  const isBillable = appointment && PER_SESSION_BILLABLE_STATUSES.includes(appointment.status)

  if (!isBillable) {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELADO" },
    })
    return { action: "cancelled", message: "Fatura cancelada (sessão não faturável)" }
  }

  const sessionFee = Number(patient.sessionFee)
  const newPrice = appointment.price ? Number(appointment.price) : sessionFee

  // Update the appointment item's price
  await tx.invoiceItem.update({
    where: { id: appointmentItem.id },
    data: { unitPrice: newPrice, total: newPrice },
  })

  // Apply an available credit if this invoice doesn't already have one
  const hasCredit = invoice.items.some(i => i.type === "CREDITO")
  if (!hasCredit) {
    const credit = await tx.sessionCredit.findFirst({
      where: { clinicId, patientId: invoice.patientId, consumedByInvoiceId: null },
      orderBy: { createdAt: "asc" },
    })
    if (credit) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          appointmentId: null,
          type: "CREDITO",
          description: `Crédito: ${credit.reason}`,
          quantity: -1,
          unitPrice: sessionFee,
          total: -sessionFee,
        },
      })
      await tx.sessionCredit.update({
        where: { id: credit.id },
        data: { consumedByInvoiceId: invoice.id, consumedAt: new Date() },
      })
    }
  }

  await recalculateInvoice(
    tx, invoice.id,
    { ...invoice, showAppointmentDays: false },
    patient, clinicTemplate, profName,
  )

  return { action: "recalculated", message: "Fatura recalculada com sucesso" }
}

export interface GroupingTransitionParams {
  invoice: {
    id: string
    patientId: string
    professionalProfileId: string
    referenceMonth: number
    referenceYear: number
    items: Array<{ type: string; description: string; quantity: number; unitPrice: number | { toNumber(): number }; total: number | { toNumber(): number } }>
  }
  patient: {
    name: string
    motherName: string | null
    fatherName: string | null
    sessionFee: { toNumber(): number } | number | null
    showAppointmentDaysOnInvoice: boolean
    invoiceMessageTemplate: string | null
    invoiceDueDay: number | null
  }
  clinic: {
    invoiceDueDay?: number | null
    invoiceMessageTemplate?: string | null
    billingMode?: string | null
    invoiceGrouping?: string | null
  } | null
  clinicId: string
  newGrouping: "MONTHLY" | "PER_SESSION"
}

/**
 * Handle recalculation when the patient's grouping mode has changed.
 * Cancels the current invoice and generates new ones with the correct type.
 */
export async function handleGroupingTransition(
  tx: Tx,
  params: GroupingTransitionParams,
): Promise<string> {
  const { invoice, patient, clinic, clinicId, newGrouping } = params
  const startDate = new Date(invoice.referenceYear, invoice.referenceMonth - 1, 1)
  const endDate = new Date(invoice.referenceYear, invoice.referenceMonth, 1)

  const [appointments, professional] = await Promise.all([
    tx.appointment.findMany({
      where: {
        clinicId,
        patientId: invoice.patientId,
        professionalProfileId: invoice.professionalProfileId,
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true, title: true,
        recurrenceId: true, groupId: true, price: true,
      },
    }),
    tx.professionalProfile.findUnique({
      where: { id: invoice.professionalProfileId },
      select: { user: { select: { name: true } } },
    }),
  ])

  const profName = professional?.user?.name || ""
  const sessionFee = Number(patient.sessionFee)
  const mappedApts = appointments.map(a => ({
    ...a,
    price: a.price ? Number(a.price) : null,
  }))

  // Collect consumed credits BEFORE releasing (needed to identify manual vs auto credits)
  const consumedCredits = await tx.sessionCredit.findMany({
    where: { consumedByInvoiceId: invoice.id },
    select: { id: true, reason: true },
  })

  // Release any SessionCredits consumed by the old invoice
  await tx.sessionCredit.updateMany({
    where: { consumedByInvoiceId: invoice.id },
    data: { consumedByInvoiceId: null, consumedAt: null },
  })

  const autoCreditDescs = new Set(
    consumedCredits.map((c: { reason: string | null }) => `Crédito: ${c.reason || ""}`)
  )
  const manualCredits = invoice.items.filter(
    i => i.type === "CREDITO" && !autoCreditDescs.has(i.description)
  )

  // Cancel the old invoice
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status: "CANCELADO" },
  })

  if (newGrouping === "PER_SESSION") {
    await generatePerSessionInvoices(tx, {
      clinicId,
      patientId: invoice.patientId,
      profId: invoice.professionalProfileId,
      month: invoice.referenceMonth,
      year: invoice.referenceYear,
      appointments: mappedApts,
      sessionFee,
      patientTemplate: patient.invoiceMessageTemplate,
      clinicTemplate: clinic?.invoiceMessageTemplate ?? null,
      clinicPaymentInfo: null,
      profName,
      patientName: patient.name,
      motherName: patient.motherName,
      fatherName: patient.fatherName,
      showAppointmentDays: patient.showAppointmentDaysOnInvoice,
    })
  } else {
    const clinicDueDay = clinic?.invoiceDueDay ?? 15
    const dueDate = new Date(Date.UTC(
      invoice.referenceYear, invoice.referenceMonth - 1,
      patient.invoiceDueDay ?? clinicDueDay, 12,
    ))
    await generateMonthlyInvoice(tx, {
      clinicId,
      patientId: invoice.patientId,
      professionalProfileId: invoice.professionalProfileId,
      month: invoice.referenceMonth,
      year: invoice.referenceYear,
      dueDate,
      sessionFee,
      showAppointmentDays: patient.showAppointmentDaysOnInvoice,
      profName,
      billingMode: clinic?.billingMode ?? null,
      patient: {
        name: patient.name,
        motherName: patient.motherName,
        fatherName: patient.fatherName,
        invoiceMessageTemplate: patient.invoiceMessageTemplate,
      },
      clinicInvoiceMessageTemplate: clinic?.invoiceMessageTemplate ?? null,
      appointments: mappedApts,
    })
  }

  // Carry manual credits to the first new invoice
  if (manualCredits.length > 0) {
    await carryManualCredits(tx, manualCredits, {
      clinicId,
      patientId: invoice.patientId,
      profId: invoice.professionalProfileId,
      month: invoice.referenceMonth,
      year: invoice.referenceYear,
    })
  }

  return newGrouping === "PER_SESSION" ? "por sessão" : "mensal"
}

/**
 * Carry manual CREDITO items from a cancelled invoice to the first
 * newly generated invoice for the same patient+month.
 */
async function carryManualCredits(
  tx: Tx,
  manualCredits: Array<{ description: string; quantity: number; unitPrice: number | { toNumber(): number }; total: number | { toNumber(): number } }>,
  ctx: { clinicId: string; patientId: string; profId: string; month: number; year: number },
) {
  const targetInvoice = await tx.invoice.findFirst({
    where: {
      clinicId: ctx.clinicId,
      patientId: ctx.patientId,
      professionalProfileId: ctx.profId,
      referenceMonth: ctx.month,
      referenceYear: ctx.year,
      status: { not: "CANCELADO" },
    },
    orderBy: { dueDate: "asc" },
    select: { id: true },
  })

  if (!targetInvoice) return

  for (const credit of manualCredits) {
    await tx.invoiceItem.create({
      data: {
        invoiceId: targetInvoice.id,
        appointmentId: null,
        type: "CREDITO",
        description: credit.description,
        quantity: credit.quantity,
        unitPrice: Number(credit.unitPrice),
        total: Number(credit.total),
      },
    })
  }

  // Recalculate totals on the target invoice
  const allItems = await tx.invoiceItem.findMany({
    where: { invoiceId: targetInvoice.id },
  })
  const totalAmount = allItems.reduce((sum: number, i: { total: unknown }) => sum + Number(i.total), 0)
  const creditsApplied = allItems.filter((i: { type: string }) => i.type === "CREDITO").length

  const isAutoPaid = totalAmount <= 0
  await tx.invoice.update({
    where: { id: targetInvoice.id },
    data: {
      totalAmount,
      creditsApplied,
      ...(isAutoPaid ? { status: "PAGO", paidAt: new Date() } : {}),
    },
  })
}
