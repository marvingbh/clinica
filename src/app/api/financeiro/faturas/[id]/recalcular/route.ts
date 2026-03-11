import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { classifyAppointments, buildInvoiceItems, buildMonthlyInvoiceItems } from "@/lib/financeiro/invoice-generator"
import { recalculateInvoice } from "@/lib/financeiro/recalculate-invoice"
import { getMonthName } from "@/lib/financeiro/format"
import { separateManualItems } from "@/lib/financeiro/invoice-generation"
import { resolveGrouping } from "@/lib/financeiro/invoice-grouping"
import { generatePerSessionInvoices } from "@/lib/financeiro/generate-per-session-invoices"
import { generateMonthlyInvoice } from "@/lib/financeiro/generate-monthly-invoice"
import { createAuditLog, AuditAction } from "@/lib/rbac/audit"

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
        invoiceGrouping: true,
      },
    })

    if (!patient || !patient.sessionFee) {
      return NextResponse.json(
        { error: "Paciente sem valor de sessão configurado" },
        { status: 400 }
      )
    }

    // Check if the grouping mode changed — if so, cancel this invoice and regenerate
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: {
        invoiceDueDay: true, invoiceMessageTemplate: true,
        billingMode: true, invoiceGrouping: true,
      },
    })

    const currentGrouping = resolveGrouping(
      clinic?.invoiceGrouping ?? "MONTHLY",
      patient.invoiceGrouping
    )

    const invoiceIsMonthly = invoice.invoiceType !== "PER_SESSION"
    const groupingChanged = (invoiceIsMonthly && currentGrouping === "PER_SESSION")
      || (!invoiceIsMonthly && currentGrouping === "MONTHLY")

    if (groupingChanged) {
      return handleGroupingTransition(invoice, patient, clinic, user, currentGrouping)
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

    const professional = await prisma.professionalProfile.findUnique({
      where: { id: invoice.professionalProfileId },
      select: { user: { select: { name: true } } },
    })

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

    createAuditLog({
      user, action: AuditAction.INVOICE_RECALCULATED, entityType: "Invoice", entityId: invoice.id,
      newValues: { invoiceType: invoice.invoiceType },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    }).catch(() => {})

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

    // Apply an available credit if this invoice doesn't already have one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasCredit = invoice.items.some((i: any) => i.type === "CREDITO")
    if (!hasCredit) {
      const credit = await tx.sessionCredit.findFirst({
        where: { clinicId: user.clinicId, patientId: invoice.patientId, consumedByInvoiceId: null },
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

    // Recalculate totals and message body
    await recalculateInvoice(
      tx, invoice.id, invoice, patient,
      clinic?.invoiceMessageTemplate ?? null, profName,
    )
  })

  return NextResponse.json({ success: true, message: "Fatura recalculada com sucesso" })
}

/**
 * Handles recalculation when the patient's grouping mode has changed
 * (e.g., MONTHLY invoice but patient is now PER_SESSION).
 * Cancels the current invoice and generates new ones with the correct type.
 */
async function handleGroupingTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patient: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clinic: any,
  user: { clinicId: string },
  newGrouping: "MONTHLY" | "PER_SESSION",
) {
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

  const professional = await prisma.professionalProfile.findUnique({
    where: { id: invoice.professionalProfileId },
    select: { user: { select: { name: true } } },
  })
  const profName = professional?.user?.name || ""
  const sessionFee = Number(patient.sessionFee)

  const mappedApts = appointments.map(a => ({
    ...a,
    price: a.price ? Number(a.price) : null,
  }))

  await prisma.$transaction(async (tx) => {
    // Release any SessionCredits consumed by the old invoice
    await tx.sessionCredit.updateMany({
      where: { consumedByInvoiceId: invoice.id },
      data: { consumedByInvoiceId: null, consumedAt: null },
    })

    // Collect manual CREDITO items (not backed by SessionCredit) to carry forward
    const consumedCredits = await tx.sessionCredit.findMany({
      where: { consumedByInvoiceId: invoice.id },
      select: { id: true, reason: true },
    })
    const autoCreditDescs = new Set(
      consumedCredits.map((c: { reason: string | null }) => `Crédito: ${c.reason || ""}`)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manualCredits = invoice.items.filter((i: any) =>
      i.type === "CREDITO" && !autoCreditDescs.has(i.description)
    )

    // Cancel the old invoice
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELADO" },
    })

    if (newGrouping === "PER_SESSION") {
      await generatePerSessionInvoices(tx, {
        clinicId: user.clinicId,
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

      // Carry manual credits to the first new per-session invoice
      if (manualCredits.length > 0) {
        await carryManualCredits(tx, manualCredits, {
          clinicId: user.clinicId,
          patientId: invoice.patientId,
          profId: invoice.professionalProfileId,
          month: invoice.referenceMonth,
          year: invoice.referenceYear,
        })
      }
    } else {
      const clinicDueDay = clinic?.invoiceDueDay ?? 15
      const dueDate = new Date(Date.UTC(
        invoice.referenceYear, invoice.referenceMonth - 1,
        patient.invoiceDueDay ?? clinicDueDay, 12,
      ))
      await generateMonthlyInvoice(tx, {
        clinicId: user.clinicId,
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

      // Carry manual credits to the new monthly invoice
      if (manualCredits.length > 0) {
        await carryManualCredits(tx, manualCredits, {
          clinicId: user.clinicId,
          patientId: invoice.patientId,
          profId: invoice.professionalProfileId,
          month: invoice.referenceMonth,
          year: invoice.referenceYear,
        })
      }
    }
  }, { timeout: 15000 })

  const label = newGrouping === "PER_SESSION" ? "por sessão" : "mensal"
  return NextResponse.json({
    success: true,
    message: `Fatura convertida para modo ${label}`,
    groupingChanged: true,
  })
}

/**
 * Carries manual CREDITO items from a cancelled invoice to the first
 * newly generated invoice for the same patient+month. Recalculates
 * the target invoice totals after adding the credit items.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carryManualCredits(
  tx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manualCredits: any[],
  ctx: { clinicId: string; patientId: string; profId: string; month: number; year: number },
) {
  // Find the first new invoice (earliest dueDate) for this patient+month
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

  // Add manual credit items to the target invoice
  for (const credit of manualCredits) {
    await tx.invoiceItem.create({
      data: {
        invoiceId: targetInvoice.id,
        appointmentId: null,
        type: "CREDITO",
        description: credit.description,
        quantity: credit.quantity,
        unitPrice: credit.unitPrice,
        total: credit.total,
      },
    })
  }

  // Recalculate totals on the target invoice
  const allItems = await tx.invoiceItem.findMany({
    where: { invoiceId: targetInvoice.id },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalAmount = allItems.reduce((sum: number, i: any) => sum + Number(i.total), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creditsApplied = allItems.filter((i: any) => i.type === "CREDITO").length

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
