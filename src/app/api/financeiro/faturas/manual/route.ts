import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { validateManualInvoiceInput, buildManualInvoiceItems } from "@/lib/financeiro/manual-invoice"
import { calculateInvoiceTotals, InvoiceItemData } from "@/lib/financeiro/invoice-generator"
import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import { getMonthName, formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"

const schema = z.object({
  patientId: z.string(),
  professionalProfileId: z.string().optional(),
  appointmentIds: z.array(z.string()).min(1).optional(),
  manualAmount: z.number().positive().optional(),
  manualDescription: z.string().max(200).optional(),
  referenceMonth: z.number().min(1).max(12).optional(),
  referenceYear: z.number().min(2020).optional(),
  markAsPaid: z.boolean().optional().default(false),
}).refine(
  data => (data.appointmentIds && data.appointmentIds.length > 0) || data.manualAmount,
  { message: "Informe agendamentos ou um valor manual" }
)

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { patientId, appointmentIds, manualAmount, manualDescription, markAsPaid } = parsed.data
    let { professionalProfileId, referenceMonth, referenceYear } = parsed.data

    // Fetch patient + clinic
    const [patient, clinic] = await Promise.all([
      prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true, name: true, motherName: true, fatherName: true,
          sessionFee: true, showAppointmentDaysOnInvoice: true,
          invoiceDueDay: true, invoiceMessageTemplate: true,
          referenceProfessionalId: true,
        },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceDueDay: true, invoiceMessageTemplate: true },
      }),
    ])

    if (!patient) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    // Resolve professionalProfileId from patient if not provided
    if (!professionalProfileId) {
      professionalProfileId = patient.referenceProfessionalId || undefined
    }
    if (!professionalProfileId) {
      return NextResponse.json({ error: "Profissional não informado" }, { status: 400 })
    }

    const professional = await prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { user: { select: { name: true } } },
    })
    const profName = professional?.user?.name || ""
    const sessionFee = patient.sessionFee ? Number(patient.sessionFee) : 0

    let items: InvoiceItemData[]
    let totals: { totalSessions: number; creditsApplied: number; extrasAdded: number; totalAmount: number }

    if (manualAmount) {
      // Manual amount — no appointments needed
      const now = new Date()
      referenceMonth = referenceMonth || (now.getMonth() + 1)
      referenceYear = referenceYear || now.getFullYear()

      items = [{
        appointmentId: null,
        type: "SESSAO_REGULAR" as const,
        description: manualDescription || "Valor avulso",
        quantity: 1,
        unitPrice: manualAmount,
        total: manualAmount,
      }]
      totals = { totalSessions: 1, creditsApplied: 0, extrasAdded: 0, totalAmount: manualAmount }
    } else {
      // Appointment-based flow
      if (!appointmentIds || appointmentIds.length === 0) {
        return NextResponse.json({ error: "Informe agendamentos ou um valor manual" }, { status: 400 })
      }
      if (!patient.sessionFee) {
        return NextResponse.json({ error: "Paciente sem valor de sessão configurado" }, { status: 400 })
      }

      const appointments = await prisma.appointment.findMany({
        where: { id: { in: appointmentIds }, clinicId: user.clinicId },
        select: {
          id: true, scheduledAt: true, status: true, type: true,
          title: true, price: true, patientId: true, clinicId: true,
        },
      })
      if (appointments.length !== appointmentIds.length) {
        return NextResponse.json({ error: "Alguns agendamentos não foram encontrados" }, { status: 404 })
      }

      const mapped = appointments.map(a => ({
        ...a,
        price: a.price ? Number(a.price) : null,
        patientId: a.patientId || patientId,
      }))
      const validation = validateManualInvoiceInput({ appointments: mapped, patientId, clinicId: user.clinicId })
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      const alreadyInvoiced = await prisma.invoiceItem.findMany({
        where: { appointmentId: { in: appointmentIds } },
        select: { appointmentId: true },
      })
      if (alreadyInvoiced.length > 0) {
        return NextResponse.json({ error: "Alguns agendamentos já estão vinculados a outra fatura" }, { status: 400 })
      }

      items = buildManualInvoiceItems(mapped, sessionFee)
      totals = calculateInvoiceTotals(items)

      const firstDate = appointments.sort((a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )[0].scheduledAt
      const refDate = new Date(firstDate)
      referenceMonth = refDate.getMonth() + 1
      referenceYear = refDate.getFullYear()
    }

    const dueDate = new Date(Date.UTC(referenceYear!, referenceMonth! - 1, patient.invoiceDueDay ?? clinic?.invoiceDueDay ?? 15, 12))

    const detalhes = buildDetailBlock(
      items.map(i => ({ description: i.description, total: formatCurrencyBRL(i.total), type: i.type })),
      { grouped: true },
    )
    const template = patient.invoiceMessageTemplate || clinic?.invoiceMessageTemplate || DEFAULT_INVOICE_TEMPLATE
    const messageBody = renderInvoiceTemplate(template, {
      paciente: patient.name,
      mae: patient.motherName || "",
      pai: patient.fatherName || "",
      valor: formatCurrencyBRL(totals.totalAmount),
      mes: getMonthName(referenceMonth!),
      ano: String(referenceYear),
      vencimento: formatDateBR(dueDate.toISOString()),
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
        professionalProfileId: professionalProfileId!,
        patientId,
        referenceMonth: referenceMonth!,
        referenceYear: referenceYear!,
        invoiceType: "MANUAL",
        status: markAsPaid ? "PAGO" : "PENDENTE",
        paidAt: markAsPaid ? new Date() : null,
        totalSessions: totals.totalSessions,
        creditsApplied: 0,
        extrasAdded: totals.extrasAdded,
        totalAmount: totals.totalAmount,
        dueDate,
        showAppointmentDays: !manualAmount,
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
