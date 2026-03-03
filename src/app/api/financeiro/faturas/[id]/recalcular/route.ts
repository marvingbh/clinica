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

    if (invoice.status !== "PENDENTE" && invoice.status !== "ENVIADO") {
      return NextResponse.json(
        { error: "Apenas faturas pendentes ou enviadas podem ser recalculadas" },
        { status: 400 }
      )
    }

    // Fetch patient data
    const patient = await prisma.patient.findUnique({
      where: { id: invoice.patientId },
      select: {
        id: true, name: true, motherName: true, fatherName: true,
        sessionFee: true, showAppointmentDaysOnInvoice: true,
        invoiceMessageTemplate: true,
      },
    })

    if (!patient || !patient.sessionFee) {
      return NextResponse.json(
        { error: "Paciente sem valor de sessão configurado" },
        { status: 400 }
      )
    }

    // Fetch appointments for this patient+professional in this month
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
        id: true, scheduledAt: true, status: true, type: true,
        recurrenceId: true, groupId: true, price: true,
      },
    })

    const [clinic, professional] = await Promise.all([
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceMessageTemplate: true, billingMode: true },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: invoice.professionalProfileId },
        select: { user: { select: { name: true } } },
      }),
    ])

    const sessionFee = Number(patient.sessionFee)
    const showDays = patient.showAppointmentDaysOnInvoice
    const profName = professional?.user?.name || ""

    const classified = classifyAppointments(
      appointments.map(a => ({ ...a, price: a.price ? Number(a.price) : null }))
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

      // Recalculate totals and message body
      await recalculateInvoice(
        tx, invoice.id, invoice, patient,
        clinic?.invoiceMessageTemplate ?? null, profName,
      )
    }, { timeout: 15000 })

    return NextResponse.json({ success: true, message: "Fatura recalculada com sucesso" })
  }
)
