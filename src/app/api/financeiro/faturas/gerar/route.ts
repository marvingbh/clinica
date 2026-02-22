import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { classifyAppointments, buildInvoiceItems, buildMonthlyInvoiceItems, calculateInvoiceTotals } from "@/lib/financeiro/invoice-generator"
import { renderInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import { getMonthName, formatCurrencyBRL } from "@/lib/financeiro/format"

const schema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  professionalProfileId: z.string().optional(),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { month, year } = parsed.data
    let professionalProfileId: string | undefined = parsed.data.professionalProfileId

    // Non-admins always scoped to own profile
    if (scope === "own") {
      professionalProfileId = user.professionalProfileId ?? undefined
    }
    // Admins without explicit selection and without own profile: generate for all (undefined = no filter)

    if (scope === "own" && !professionalProfileId) {
      return NextResponse.json(
        { error: "Seu usuario nao possui perfil profissional. Contate o administrador." },
        { status: 400 }
      )
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)
    const dueDate = new Date(year, month - 1, 15)

    const whereClause: Record<string, unknown> = {
      clinicId: user.clinicId,
      patientId: { not: null },
      scheduledAt: { gte: startDate, lt: endDate },
      type: { in: ["CONSULTA", "REUNIAO"] },
    }
    if (professionalProfileId) {
      whereClause.professionalProfileId = professionalProfileId
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        type: true,
        recurrenceId: true,
        groupId: true,
        price: true,
        patientId: true,
        professionalProfileId: true,
      },
    })

    // Group by professionalProfileId + patientId
    const byProfAndPatient = new Map<string, typeof appointments>()
    for (const apt of appointments) {
      if (!apt.patientId) continue
      const key = `${apt.professionalProfileId}::${apt.patientId}`
      const list = byProfAndPatient.get(key) || []
      list.push(apt)
      byProfAndPatient.set(key, list)
    }

    if (byProfAndPatient.size === 0) {
      return NextResponse.json({ error: "Nenhum paciente com agendamentos neste mês" }, { status: 404 })
    }

    // Collect unique patient and professional IDs
    const patientIds = new Set<string>()
    const profIds = new Set<string>()
    for (const [key] of byProfAndPatient) {
      const [profId, patId] = key.split("::")
      profIds.add(profId)
      patientIds.add(patId)
    }

    const [patients, clinic, professionals] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: Array.from(patientIds) } },
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
        select: { invoiceMessageTemplate: true, billingMode: true },
      }),
      prisma.professionalProfile.findMany({
        where: { id: { in: Array.from(profIds) } },
        select: { id: true, user: { select: { name: true } } },
      }),
    ])

    const patientMap = new Map(patients.map(p => [p.id, p]))
    const profMap = new Map(professionals.map(p => [p.id, p]))

    // Build the invoice filter for existing invoices to delete
    const invoiceWhereClause: Record<string, unknown> = {
      clinicId: user.clinicId,
      referenceMonth: month,
      referenceYear: year,
    }
    if (professionalProfileId) {
      invoiceWhereClause.professionalProfileId = professionalProfileId
    }

    const results = await prisma.$transaction(async (tx) => {
      // Bulk cleanup: delete existing invoices + items + release credits for this month
      // before regenerating
      const existingInvoices = await tx.invoice.findMany({
        where: invoiceWhereClause,
        select: { id: true },
      })
      const existingIds = existingInvoices.map(i => i.id)

      if (existingIds.length > 0) {
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: { in: existingIds } },
        })
        await tx.sessionCredit.updateMany({
          where: { consumedByInvoiceId: { in: existingIds } },
          data: { consumedByInvoiceId: null, consumedAt: null },
        })
        await tx.invoice.deleteMany({
          where: { id: { in: existingIds } },
        })
      }

      const invoices = []

      for (const [key, patientApts] of byProfAndPatient) {
        const [profId, patientId] = key.split("::")
        const patient = patientMap.get(patientId)
        if (!patient || !patient.sessionFee) continue

        const sessionFee = Number(patient.sessionFee)
        const showDays = patient.showAppointmentDaysOnInvoice
        const profName = profMap.get(profId)?.user?.name || ""

        const classified = classifyAppointments(
          patientApts.map(a => ({
            ...a,
            price: a.price ? Number(a.price) : null,
          }))
        )

        const availableCredits = await tx.sessionCredit.findMany({
          where: {
            professionalProfileId: profId,
            patientId,
            consumedByInvoiceId: null,
          },
          orderBy: { createdAt: "asc" },
        })

        let items
        if (clinic?.billingMode === "MONTHLY_FIXED") {
          const totalSessionCount = classified.regular.length + classified.extra.length
            + classified.group.length + classified.schoolMeeting.length
          items = buildMonthlyInvoiceItems(
            sessionFee, totalSessionCount, getMonthName(month), String(year), availableCredits, sessionFee
          )
        } else {
          items = buildInvoiceItems(classified, sessionFee, availableCredits, showDays)
        }
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
            professionalProfileId: profId,
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
    }, { timeout: 30000 })

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
