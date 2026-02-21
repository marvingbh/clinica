import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { classifyAppointments, buildInvoiceItems, calculateInvoiceTotals } from "@/lib/financeiro/invoice-generator"
import { renderInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import { getMonthName, formatCurrencyBRL } from "@/lib/financeiro/format"

const schema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  professionalProfileId: z.string().optional(),
})

export const POST = withAuth(
  { resource: "invoice", action: "create" },
  async (req: NextRequest, { user, scope }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { month, year } = parsed.data
    let professionalProfileId = parsed.data.professionalProfileId

    if (scope === "own" || !professionalProfileId) {
      professionalProfileId = user.professionalProfileId!
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)
    const dueDate = new Date(year, month - 1, 15)

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        professionalProfileId,
        patientId: { not: null },
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        type: true,
        recurrenceId: true,
        groupId: true,
        price: true,
        patientId: true,
      },
    })

    const byPatient = new Map<string, typeof appointments>()
    for (const apt of appointments) {
      if (!apt.patientId) continue
      const list = byPatient.get(apt.patientId) || []
      list.push(apt)
      byPatient.set(apt.patientId, list)
    }

    if (byPatient.size === 0) {
      return NextResponse.json({ error: "Nenhum paciente com agendamentos neste m\u00eas" }, { status: 404 })
    }

    const patientIds = Array.from(byPatient.keys())
    const [patients, clinic, professional] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: {
          id: true,
          name: true,
          motherName: true,
          fatherName: true,
          sessionFee: true,
          showAppointmentDaysOnInvoice: true,
          invoiceMessageTemplate: true,
        },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceMessageTemplate: true },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: professionalProfileId },
        select: { user: { select: { name: true } } },
      }),
    ])

    const patientMap = new Map(patients.map(p => [p.id, p]))
    const profName = professional?.user?.name || ""

    const results = await prisma.$transaction(async (tx) => {
      const invoices = []

      for (const [patientId, patientApts] of byPatient) {
        const patient = patientMap.get(patientId)
        if (!patient || !patient.sessionFee) continue

        const sessionFee = Number(patient.sessionFee)
        const showDays = patient.showAppointmentDaysOnInvoice

        await tx.invoice.deleteMany({
          where: {
            professionalProfileId,
            patientId,
            referenceMonth: month,
            referenceYear: year,
          },
        })

        await tx.sessionCredit.updateMany({
          where: {
            professionalProfileId,
            patientId,
            consumedByInvoice: {
              referenceMonth: month,
              referenceYear: year,
            },
          },
          data: {
            consumedByInvoiceId: null,
            consumedAt: null,
          },
        })

        const classified = classifyAppointments(
          patientApts.map(a => ({
            ...a,
            price: a.price ? Number(a.price) : null,
          }))
        )

        const availableCredits = await tx.sessionCredit.findMany({
          where: {
            professionalProfileId,
            patientId,
            consumedByInvoiceId: null,
          },
          orderBy: { createdAt: "asc" },
        })

        const items = buildInvoiceItems(classified, sessionFee, availableCredits, showDays)
        const totals = calculateInvoiceTotals(items)

        const template = patient.invoiceMessageTemplate
          || clinic?.invoiceMessageTemplate
          || DEFAULT_INVOICE_TEMPLATE
        const messageBody = renderInvoiceTemplate(template, {
          paciente: patient.name,
          mae: patient.motherName || "",
          pai: patient.fatherName || "",
          valor: formatCurrencyBRL(totals.totalAmount),
          mes: getMonthName(month),
          ano: String(year),
          vencimento: dueDate.toLocaleDateString("pt-BR"),
          sessoes: String(totals.totalSessions),
          profissional: profName,
        })

        const invoice = await tx.invoice.create({
          data: {
            clinicId: user.clinicId,
            professionalProfileId,
            patientId,
            referenceMonth: month,
            referenceYear: year,
            totalSessions: totals.totalSessions,
            creditsApplied: totals.creditsApplied,
            extrasAdded: totals.extrasAdded,
            totalAmount: totals.totalAmount,
            dueDate,
            showAppointmentDays: showDays,
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

        invoices.push(invoice)
      }

      return invoices
    })

    return NextResponse.json({
      generated: results.length,
      invoices: results.map(inv => ({
        id: inv.id,
        patientId: inv.patientId,
        totalAmount: inv.totalAmount,
        status: inv.status,
      })),
    }, { status: 201 })
  }
)
