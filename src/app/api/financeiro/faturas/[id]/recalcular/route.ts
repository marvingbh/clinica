import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { classifyAppointments, buildInvoiceItems, buildMonthlyInvoiceItems } from "@/lib/financeiro/invoice-generator"
import { recalculateInvoice } from "@/lib/financeiro/recalculate-invoice"
import { getMonthName } from "@/lib/financeiro/format"
import { separateManualItems } from "@/lib/financeiro/invoice-generation"
import { resolveGrouping } from "@/lib/financeiro/invoice-grouping"
import {
  recalculatePerSession,
  handleGroupingTransition,
} from "@/lib/financeiro/recalculate-dispatch"
import { audit, AuditAction } from "@/lib/rbac/audit"

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

    // Grouping transition: cancel old invoice, regenerate with new type
    if (groupingChanged) {
      await prisma.$transaction(async (tx) => {
        await handleGroupingTransition(tx, {
          invoice, patient, clinic, clinicId: user.clinicId, newGrouping: currentGrouping,
        })
      }, { timeout: 15000 })

      audit.log({
        user, action: AuditAction.INVOICE_RECALCULATED, entityType: "Invoice", entityId: invoice.id,
        newValues: { groupingChanged: true, newGrouping: currentGrouping },
        request: req,
      }).catch(() => {})

      const label = currentGrouping === "PER_SESSION" ? "por sessão" : "mensal"
      return NextResponse.json({
        success: true,
        message: `Fatura convertida para modo ${label}`,
        groupingChanged: true,
      })
    }

    // PER_SESSION: simplified recalculation for single-appointment invoices
    if (invoice.invoiceType === "PER_SESSION") {
      const professional = await prisma.professionalProfile.findUnique({
        where: { id: invoice.professionalProfileId },
        select: { user: { select: { name: true } } },
      })

      const result = await prisma.$transaction(async (tx) => {
        return recalculatePerSession(tx, {
          invoice, patient, clinicId: user.clinicId,
        }, clinic?.invoiceMessageTemplate ?? null, professional?.user?.name || "")
      })

      audit.log({
        user, action: AuditAction.INVOICE_RECALCULATED, entityType: "Invoice", entityId: invoice.id,
        newValues: { invoiceType: "PER_SESSION", result: result.action },
        request: req,
      }).catch(() => {})

      return NextResponse.json({ success: true, message: result.message })
    }

    // MONTHLY path
    const startDate = new Date(invoice.referenceYear, invoice.referenceMonth - 1, 1)
    const endDate = new Date(invoice.referenceYear, invoice.referenceMonth, 1)

    const [monthAppointments, uninvoicedPriorAppointments, professional] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          patientId: invoice.patientId,
          professionalProfileId: invoice.professionalProfileId,
          scheduledAt: { gte: startDate, lt: endDate },
          type: { in: ["CONSULTA", "REUNIAO"] },
        },
        select: {
          id: true, scheduledAt: true, status: true, type: true, title: true,
          recurrenceId: true, groupId: true, sessionGroupId: true, price: true,
        },
      }),
      // Include uninvoiced appointments from prior months
      prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          patientId: invoice.patientId,
          professionalProfileId: invoice.professionalProfileId,
          scheduledAt: { lt: startDate },
          type: { in: ["CONSULTA", "REUNIAO"] },
          invoiceItems: { none: {} },
        },
        select: {
          id: true, scheduledAt: true, status: true, type: true, title: true,
          recurrenceId: true, groupId: true, sessionGroupId: true, price: true,
        },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: invoice.professionalProfileId },
        select: { user: { select: { name: true } } },
      }),
    ])

    const appointments = [...monthAppointments, ...uninvoicedPriorAppointments]

    const sessionFee = Number(patient.sessionFee)
    const showDays = patient.showAppointmentDaysOnInvoice
    const profName = professional?.user?.name || ""

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
      const consumedCredits = await tx.sessionCredit.findMany({
        where: { consumedByInvoiceId: invoice.id },
        select: { id: true, reason: true },
      })

      await tx.sessionCredit.updateMany({
        where: { consumedByInvoiceId: invoice.id },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })

      const { autoItems } = separateManualItems(invoice.items, consumedCredits)
      if (autoItems.length > 0) {
        await tx.invoiceItem.deleteMany({
          where: { id: { in: autoItems.map(i => i.id) } },
        })
      }

      const availableCredits = await tx.sessionCredit.findMany({
        where: { clinicId: user.clinicId, patientId: invoice.patientId, consumedByInvoiceId: null },
        orderBy: { createdAt: "asc" },
      })

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

      const creditItems = items.filter(i => i.type === "CREDITO" && i.creditId)
      for (const ci of creditItems) {
        await tx.sessionCredit.update({
          where: { id: ci.creditId! },
          data: { consumedByInvoiceId: invoice.id, consumedAt: new Date() },
        })
      }

      const newDueDate = new Date(Date.UTC(invoice.referenceYear, invoice.referenceMonth - 1, patient.invoiceDueDay ?? clinic?.invoiceDueDay ?? 15, 12))
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { dueDate: newDueDate },
      })

      await recalculateInvoice(
        tx, invoice.id, { ...invoice, dueDate: newDueDate }, patient,
        clinic?.invoiceMessageTemplate ?? null, profName,
      )
    }, { timeout: 15000 })

    audit.log({
      user, action: AuditAction.INVOICE_RECALCULATED, entityType: "Invoice", entityId: invoice.id,
      newValues: { invoiceType: invoice.invoiceType },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ success: true, message: "Fatura recalculada com sucesso" })
  }
)
