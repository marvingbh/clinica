import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { classifyAppointments, buildInvoiceItems, buildMonthlyInvoiceItems, calculateInvoiceTotals } from "@/lib/financeiro/invoice-generator"
import { renderInvoiceTemplate, buildDetailBlock, DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import { getMonthName, formatCurrencyBRL } from "@/lib/financeiro/format"
import { recalculateInvoice } from "@/lib/financeiro/recalculate-invoice"
import { determineInvoiceProfessional, shouldSkipInvoice, separateManualItems } from "@/lib/financeiro/invoice-generation"

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

    if (scope === "own") {
      professionalProfileId = user.professionalProfileId ?? undefined
    }

    if (scope === "own" && !professionalProfileId) {
      return NextResponse.json(
        { error: "Seu usuario nao possui perfil profissional. Contate o administrador." },
        { status: 400 }
      )
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)
    const dueDate = new Date(year, month - 1, 15)

    // Step 1: Fetch appointments filtered by professional (determines which patients)
    const whereClause: Record<string, unknown> = {
      clinicId: user.clinicId,
      patientId: { not: null },
      scheduledAt: { gte: startDate, lt: endDate },
      type: { in: ["CONSULTA", "REUNIAO"] },
    }
    if (professionalProfileId) {
      whereClause.professionalProfileId = professionalProfileId
    }

    const filteredAppointments = await prisma.appointment.findMany({
      where: whereClause,
      select: { patientId: true },
    })

    // Step 2: Collect unique patientIds
    const patientIds = [...new Set(filteredAppointments.map(a => a.patientId).filter(Boolean))] as string[]
    if (patientIds.length === 0) {
      return NextResponse.json({ error: "Nenhum paciente com agendamentos neste mês" }, { status: 404 })
    }

    // Step 3: Fetch ALL appointments for those patients (no professional filter)
    const allAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId: { in: patientIds },
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true,
        recurrenceId: true, groupId: true, price: true,
        patientId: true, professionalProfileId: true,
      },
    })

    // Step 4: Group by patientId only
    const byPatient = new Map<string, typeof allAppointments>()
    for (const apt of allAppointments) {
      if (!apt.patientId) continue
      const list = byPatient.get(apt.patientId) || []
      list.push(apt)
      byPatient.set(apt.patientId, list)
    }

    // Collect unique professional IDs for name lookup
    const profIds = new Set<string>()
    for (const apts of byPatient.values()) {
      for (const a of apts) profIds.add(a.professionalProfileId)
    }

    const [patients, clinic, professionals] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: {
          id: true, name: true, motherName: true, fatherName: true,
          sessionFee: true, showAppointmentDaysOnInvoice: true,
          invoiceMessageTemplate: true, referenceProfessionalId: true,
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

    const results = await prisma.$transaction(async (tx) => {
      let generated = 0
      let updated = 0
      let skipped = 0

      for (const [patientId, patientApts] of byPatient) {
        const patient = patientMap.get(patientId)
        if (!patient || !patient.sessionFee) continue

        // Step 5: Check existing invoice
        const existing = await tx.invoice.findUnique({
          where: {
            clinicId_patientId_referenceMonth_referenceYear: {
              clinicId: user.clinicId, patientId, referenceMonth: month, referenceYear: year,
            },
          },
          include: { items: true },
        })

        if (existing && shouldSkipInvoice(existing.status)) {
          skipped++
          continue
        }

        const sessionFee = Number(patient.sessionFee)
        const showDays = patient.showAppointmentDaysOnInvoice
        const assignedProfId = determineInvoiceProfessional(
          patient.referenceProfessionalId, patientApts,
        )
        const profName = profMap.get(assignedProfId)?.user?.name || ""

        const classified = classifyAppointments(
          patientApts.map(a => ({ ...a, price: a.price ? Number(a.price) : null }))
        )

        // SessionCredits: query by clinicId + patientId (cross-professional)
        const availableCredits = await tx.sessionCredit.findMany({
          where: { clinicId: user.clinicId, patientId, consumedByInvoiceId: null },
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

        if (existing) {
          // UPDATE in place: preserve manual items, notes, NF info, status
          await tx.sessionCredit.updateMany({
            where: { consumedByInvoiceId: existing.id },
            data: { consumedByInvoiceId: null, consumedAt: null },
          })

          const { autoItems } = separateManualItems(existing.items)
          if (autoItems.length > 0) {
            await tx.invoiceItem.deleteMany({
              where: { id: { in: autoItems.map(i => i.id) } },
            })
          }

          // Create new auto items
          for (const item of items) {
            await tx.invoiceItem.create({
              data: {
                invoiceId: existing.id,
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
              data: { consumedByInvoiceId: existing.id, consumedAt: new Date() },
            })
          }

          // Update professionalProfileId
          await tx.invoice.update({
            where: { id: existing.id },
            data: { professionalProfileId: assignedProfId },
          })

          // Recalculate totals (includes kept manual items)
          await recalculateInvoice(
            tx, existing.id, existing, patient,
            clinic?.invoiceMessageTemplate ?? null, profName,
          )

          updated++
        } else {
          // CREATE new invoice
          const totals = calculateInvoiceTotals(items)
          const detailItems = clinic?.billingMode === "MONTHLY_FIXED"
            ? items
            : buildInvoiceItems(classified, sessionFee, availableCredits, true)
          const detalhes = buildDetailBlock(
            detailItems.map(i => ({
              description: i.description,
              total: formatCurrencyBRL(i.total),
              type: i.type,
            })),
            { grouped: true }
          )

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
            sessoes_regulares: String(classified.regular.length),
            sessoes_extras: String(classified.extra.length),
            sessoes_grupo: String(classified.group.length),
            reunioes_escola: String(classified.schoolMeeting.length),
            creditos: String(totals.creditsApplied),
            valor_sessao: formatCurrencyBRL(sessionFee),
            detalhes,
          })

          const invoice = await tx.invoice.create({
            data: {
              clinicId: user.clinicId,
              professionalProfileId: assignedProfId,
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

          generated++
        }
      }

      return { generated, updated, skipped }
    }, { timeout: 30000 })

    return NextResponse.json(results, { status: 201 })
  }
)
