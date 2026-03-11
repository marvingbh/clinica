import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { classifyAppointments, buildInvoiceItems, buildMonthlyInvoiceItems } from "@/lib/financeiro/invoice-generator"
import { recalculateInvoice } from "@/lib/financeiro/recalculate-invoice"
import { getMonthName } from "@/lib/financeiro/format"
import { separateManualItems } from "@/lib/financeiro/invoice-generation"

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: { items: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    if (invoice.status !== "PENDENTE" && invoice.status !== "ENVIADO" && invoice.status !== "PARCIAL") {
      return NextResponse.json(
        { error: "Apenas faturas pendentes, enviadas ou parciais podem ser recalculadas" },
        { status: 400 }
      )
    }

    // Fetch patient data
    const patient = await prisma.patient.findUnique({
      where: { id: invoice.patientId },
      select: {
        id: true, name: true, motherName: true, fatherName: true,
        sessionFee: true, showAppointmentDaysOnInvoice: true,
        invoiceDueDay: true, invoiceMessageTemplate: true,
      },
    })

    if (!patient || !patient.sessionFee) {
      return NextResponse.json(
        { error: "Paciente sem valor de sessão configurado" },
        { status: 400 }
      )
    }

    // PER_SESSION: simplified recalculation for single-appointment invoices
    if (invoice.invoiceType === "PER_SESSION") {
      return recalculatePerSession(invoice, patient, user)
    }

    // MONTHLY path: fetch appointments for this patient+professional in this month
    const startDate = new Date(invoice.referenceYear, invoice.referenceMonth - 1, 1)
    const endDate = new Date(invoice.referenceYear, invoice.referenceMonth, 1)

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId: invoice.patientId,
        professionalProfileId: invoice.professionalProfileId,
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true, title: true,
        recurrenceId: true, groupId: true, price: true,
      },
    })

    const [clinic, professional] = await Promise.all([
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceDueDay: true, invoiceMessageTemplate: true, billingMode: true },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: invoice.professionalProfileId },
        select: { user: { select: { name: true } } },
      }),
    ])

    const sessionFee = Number(patient.sessionFee)
    const showDays = patient.showAppointmentDaysOnInvoice
    const profName = professional?.user?.name || ""

    // Filter out appointments already invoiced in OTHER invoices (prevents double-billing)
    const alreadyInvoiced = await prisma.invoiceItem.findMany({
      where: {
        appointmentId: { in: appointments.map(a => a.id) },
        invoice: { id: { not: invoice.id } },
      },
      select: { appointmentId: true },
    })
    const invoicedElsewhereIds = new Set(alreadyInvoiced.map(i => i.appointmentId))
    const availableAppointments = appointments.filter(a => !invoicedElsewhereIds.has(a.id))

    const classified = classifyAppointments(
      availableAppointments.map(a => ({ ...a, price: a.price ? Number(a.price) : null }))
    )

    await prisma.$transaction(async (tx) => {
      // Release consumed credits
      const consumedCredits = await tx.sessionCredit.findMany({
        where: { consumedByInvoiceId: invoice.id },
        select: { id: true, reason: true },
      })

      await tx.sessionCredit.updateMany({
        where: { consumedByInvoiceId: invoice.id },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })

      // Delete auto-generated items, keep manual ones
      const { autoItems } = separateManualItems(invoice.items, consumedCredits)
      if (autoItems.length > 0) {
        await tx.invoiceItem.deleteMany({
          where: { id: { in: autoItems.map(i => i.id) } },
        })
      }

      // Fetch fresh available credits
      const availableCredits = await tx.sessionCredit.findMany({
        where: { clinicId: user.clinicId, patientId: invoice.patientId, consumedByInvoiceId: null },
        orderBy: { createdAt: "asc" },
      })

      // Build new items
      let items
      if (clinic?.billingMode === "MONTHLY_FIXED") {
        const totalSessionCount = classified.regular.length + classified.extra.length
          + classified.group.length + classified.schoolMeeting.length
        items = buildMonthlyInvoiceItems(
          sessionFee, totalSessionCount, getMonthName(invoice.referenceMonth), String(invoice.referenceYear), availableCredits, sessionFee
        )
      } else {
        items = buildInvoiceItems(classified, sessionFee, availableCredits, showDays)
      }

      // Create new auto items
      for (const item of items) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
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
          data: { consumedByInvoiceId: invoice.id, consumedAt: new Date() },
        })
      }

      // Update due date from clinic settings
      const newDueDate = new Date(Date.UTC(invoice.referenceYear, invoice.referenceMonth - 1, patient.invoiceDueDay ?? clinic?.invoiceDueDay ?? 15, 12))
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { dueDate: newDueDate },
      })

      // Recalculate totals and message body
      await recalculateInvoice(
        tx, invoice.id, { ...invoice, dueDate: newDueDate }, patient,
        clinic?.invoiceMessageTemplate ?? null, profName,
      )
    }, { timeout: 15000 })

    return NextResponse.json({ success: true, message: "Fatura recalculada com sucesso" })
  }
)

const PER_SESSION_BILLABLE_STATUSES = ["AGENDADO", "CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA"]

/**
 * Simplified recalculation for PER_SESSION invoices.
 * Each per-session invoice has a single appointment. We update the price
 * to the current sessionFee (or appointment override) and recalculate totals.
 * If the appointment is gone or no longer billable, the invoice is cancelled.
 */
async function recalculatePerSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patient: any,
  user: { clinicId: string },
) {
  // Find the single appointment item (skip manual/credit items)
  const appointmentItem = invoice.items.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (i: any) => i.appointmentId != null && i.type !== "CREDITO"
  )

  if (!appointmentItem) {
    return NextResponse.json({ success: true, message: "Fatura recalculada (sem item de sessão)" })
  }

  // Fetch the linked appointment
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentItem.appointmentId },
    select: { id: true, status: true, price: true },
  })

  const isBillable = appointment && PER_SESSION_BILLABLE_STATUSES.includes(appointment.status)

  if (!isBillable) {
    // Appointment deleted or no longer billable — cancel the invoice
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELADO" },
    })
    return NextResponse.json({ success: true, message: "Fatura cancelada (sessão não faturável)" })
  }

  const sessionFee = Number(patient.sessionFee)
  const newPrice = appointment.price ? Number(appointment.price) : sessionFee

  const [clinic, professional] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { invoiceMessageTemplate: true },
    }),
    prisma.professionalProfile.findUnique({
      where: { id: invoice.professionalProfileId },
      select: { user: { select: { name: true } } },
    }),
  ])
  const profName = professional?.user?.name || ""

  await prisma.$transaction(async (tx) => {
    // Update the appointment item's price
    await tx.invoiceItem.update({
      where: { id: appointmentItem.id },
      data: { unitPrice: newPrice, total: newPrice },
    })

    // Recalculate totals and message body
    await recalculateInvoice(
      tx, invoice.id, invoice, patient,
      clinic?.invoiceMessageTemplate ?? null, profName,
    )
  })

  return NextResponse.json({ success: true, message: "Fatura recalculada com sucesso" })
}
