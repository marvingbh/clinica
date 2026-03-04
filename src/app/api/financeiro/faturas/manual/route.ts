import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { validateManualInvoiceInput, buildManualInvoiceItems } from "@/lib/financeiro/manual-invoice"
import { calculateInvoiceTotals } from "@/lib/financeiro/invoice-generator"
import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import { getMonthName, formatCurrencyBRL } from "@/lib/financeiro/format"

const schema = z.object({
  patientId: z.string(),
  professionalProfileId: z.string(),
  appointmentIds: z.array(z.string()).min(1),
  markAsPaid: z.boolean().optional().default(false),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { patientId, professionalProfileId, appointmentIds, markAsPaid } = parsed.data

    // Fetch appointments
    const appointments = await prisma.appointment.findMany({
      where: {
        id: { in: appointmentIds },
        clinicId: user.clinicId,
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true,
        title: true, price: true, patientId: true, clinicId: true,
      },
    })

    if (appointments.length !== appointmentIds.length) {
      return NextResponse.json({ error: "Alguns agendamentos não foram encontrados" }, { status: 404 })
    }

    // Validate using domain function
    const mapped = appointments.map(a => ({
      ...a,
      price: a.price ? Number(a.price) : null,
      patientId: a.patientId || patientId,
    }))
    const validation = validateManualInvoiceInput({
      appointments: mapped,
      patientId,
      clinicId: user.clinicId,
    })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Check none are already invoiced
    const alreadyInvoiced = await prisma.invoiceItem.findMany({
      where: { appointmentId: { in: appointmentIds } },
      select: { appointmentId: true },
    })
    if (alreadyInvoiced.length > 0) {
      return NextResponse.json(
        { error: "Alguns agendamentos já estão vinculados a outra fatura" },
        { status: 400 }
      )
    }

    // Fetch patient + clinic + professional
    const [patient, clinic, professional] = await Promise.all([
      prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true, name: true, motherName: true, fatherName: true,
          sessionFee: true, showAppointmentDaysOnInvoice: true,
          invoiceMessageTemplate: true,
        },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceDueDay: true, invoiceMessageTemplate: true },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: professionalProfileId },
        select: { user: { select: { name: true } } },
      }),
    ])

    if (!patient || !patient.sessionFee) {
      return NextResponse.json({ error: "Paciente sem valor de sessão configurado" }, { status: 400 })
    }

    const sessionFee = Number(patient.sessionFee)
    const profName = professional?.user?.name || ""

    // Build items using domain function
    const items = buildManualInvoiceItems(mapped, sessionFee)
    const totals = calculateInvoiceTotals(items)

    // Derive reference month from first appointment
    const firstDate = appointments.sort((a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )[0].scheduledAt
    const refDate = new Date(firstDate)
    const referenceMonth = refDate.getMonth() + 1
    const referenceYear = refDate.getFullYear()
    const dueDate = new Date(referenceYear, referenceMonth, clinic?.invoiceDueDay ?? 15)

    // Build message body
    const detalhes = buildDetailBlock(
      items.map(i => ({ description: i.description, total: formatCurrencyBRL(i.total), type: i.type })),
      { grouped: true },
    )

    const template = patient.invoiceMessageTemplate
      || clinic?.invoiceMessageTemplate
      || DEFAULT_INVOICE_TEMPLATE
    const messageBody = renderInvoiceTemplate(template, {
      paciente: patient.name,
      mae: patient.motherName || "",
      pai: patient.fatherName || "",
      valor: formatCurrencyBRL(totals.totalAmount),
      mes: getMonthName(referenceMonth),
      ano: String(referenceYear),
      vencimento: dueDate.toLocaleDateString("pt-BR"),
      sessoes: String(totals.totalSessions),
      profissional: profName,
      sessoes_regulares: String(items.filter(i => i.type === "SESSAO_REGULAR").length),
      sessoes_extras: String(items.filter(i => i.type === "SESSAO_EXTRA").length),
      sessoes_grupo: String(items.filter(i => i.type === "SESSAO_GRUPO").length),
      reunioes_escola: String(items.filter(i => i.type === "REUNIAO_ESCOLA").length),
      creditos: "0",
      valor_sessao: formatCurrencyBRL(sessionFee),
      detalhes,
    })

    const invoice = await prisma.invoice.create({
      data: {
        clinicId: user.clinicId,
        professionalProfileId,
        patientId,
        referenceMonth,
        referenceYear,
        invoiceType: "MANUAL",
        status: markAsPaid ? "PAGO" : "PENDENTE",
        paidAt: markAsPaid ? new Date() : null,
        totalSessions: totals.totalSessions,
        creditsApplied: 0,
        extrasAdded: totals.extrasAdded,
        totalAmount: totals.totalAmount,
        dueDate,
        showAppointmentDays: true,
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

    return NextResponse.json({ id: invoice.id }, { status: 201 })
  }
)
