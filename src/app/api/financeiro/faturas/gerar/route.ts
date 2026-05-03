import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { generateMonthlyInvoice } from "@/lib/financeiro/generate-monthly-invoice"
import { generatePerSessionInvoices } from "@/lib/financeiro/generate-per-session-invoices"
import { resolveGrouping } from "@/lib/financeiro/invoice-grouping"
import { fetchUninvoicedPriorAppointmentsBulk } from "@/lib/financeiro/uninvoiced-appointments"
import { PATIENT_FOR_INVOICE_SELECT, APPOINTMENT_FOR_INVOICE_SELECT } from "@/lib/financeiro/invoice-includes"

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

    // Step 3: Fetch appointments for those patients in the reference month
    const allAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId: { in: patientIds },
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: { ...APPOINTMENT_FOR_INVOICE_SELECT, patientId: true },
    })

    // Load patient + clinic data early (needed for grouping decision)
    const [patients, clinic] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: PATIENT_FOR_INVOICE_SELECT,
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceDueDay: true, invoiceMessageTemplate: true, billingMode: true, invoiceGrouping: true },
      }),
    ])

    const patientMap = new Map(patients.map(p => [p.id, p]))

    // Step 4: Group appointments — per patient (consolidated) or per patient+professional (split)
    const byGroup = new Map<string, typeof allAppointments>()
    for (const apt of allAppointments) {
      if (!apt.patientId) continue
      const patient = patientMap.get(apt.patientId)
      const splitByProf = patient?.splitInvoiceByProfessional ?? false
      const key = splitByProf ? `${apt.patientId}|${apt.professionalProfileId}` : apt.patientId
      const list = byGroup.get(key) || []
      list.push(apt)
      byGroup.set(key, list)
    }

    // Step 4b: Fetch uninvoiced prior appointments first (needed for cleanup decisions)
    // Also includes appointments only invoiced in PENDENTE invoices for this month (will be rebuilt)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priorAptsBulk = await fetchUninvoicedPriorAppointmentsBulk(prisma as any, {
      clinicId: user.clinicId,
      patientIds,
      beforeDate: startDate,
      targetMonth: month,
      targetYear: year,
    })
    for (const apt of priorAptsBulk) {
      if (!apt.patientId) continue
      const patient = patientMap.get(apt.patientId)
      const splitByProf = patient?.splitInvoiceByProfessional ?? false
      const key = splitByProf ? `${apt.patientId}|${apt.professionalProfileId}` : apt.patientId
      const list = byGroup.get(key) || []
      if (!list.some(a => a.id === apt.id)) {
        list.push(apt)
        byGroup.set(key, list)
      }
    }

    // Step 4c: Clean up misplaced invoice items based on patient's split setting.
    // Now we have ALL appointments (current month + prior) to make correct decisions.
    for (const p of patients) {
      if (p.splitInvoiceByProfessional) {
        // For split patients: find items in non-PAGO invoices where the invoice's professional
        // doesn't match the appointment's professional, and remove them.
        const misplacedItems = await prisma.invoiceItem.findMany({
          where: {
            invoice: {
              clinicId: user.clinicId,
              patientId: p.id,
              referenceMonth: month,
              referenceYear: year,
              status: { notIn: ["PAGO"] },
            },
            appointment: { isNot: null },
          },
          select: {
            id: true,
            appointment: { select: { id: true, professionalProfileId: true } },
            invoice: { select: { id: true, professionalProfileId: true } },
          },
        })

        const toDelete: string[] = []
        const affectedInvoiceIds = new Set<string>()
        for (const item of misplacedItems) {
          if (!item.appointment) continue
          if (item.appointment.professionalProfileId !== item.invoice.professionalProfileId) {
            toDelete.push(item.id)
            affectedInvoiceIds.add(item.invoice.id)
          }
        }

        if (toDelete.length > 0) {
          for (const invId of affectedInvoiceIds) {
            await prisma.sessionCredit.updateMany({
              where: { consumedByInvoiceId: invId },
              data: { consumedByInvoiceId: null, consumedAt: null },
            })
          }
          await prisma.invoiceItem.deleteMany({ where: { id: { in: toDelete } } })
          for (const invId of affectedInvoiceIds) {
            const remaining = await prisma.invoiceItem.count({ where: { invoiceId: invId } })
            if (remaining === 0) {
              await prisma.invoice.delete({ where: { id: invId } })
            } else {
              const totals = await prisma.invoiceItem.aggregate({ where: { invoiceId: invId }, _sum: { total: true } })
              await prisma.invoice.update({
                where: { id: invId },
                data: {
                  totalAmount: totals._sum.total ?? 0,
                  totalSessions: await prisma.invoiceItem.count({ where: { invoiceId: invId, type: { not: "CREDITO" } } }),
                },
              })
            }
          }
        }
      } else {
        // Consolidated patients: delete orphaned invoices under wrong professional
        const billingProfId = p.referenceProfessionalId || allAppointments.find(a => a.patientId === p.id)?.professionalProfileId
        if (!billingProfId) continue
        await prisma.invoice.deleteMany({
          where: {
            clinicId: user.clinicId,
            patientId: p.id,
            referenceMonth: month,
            referenceYear: year,
            professionalProfileId: { not: billingProfId },
            status: "PENDENTE",
          },
        })
      }
    }

    // Collect unique professional IDs for name lookup (from appointments + reference professionals)
    const profIds = new Set<string>()
    for (const apts of byGroup.values()) {
      for (const a of apts) profIds.add(a.professionalProfileId)
    }
    const clinicDueDay = clinic?.invoiceDueDay ?? 15

    // Ensure reference professional IDs are also fetched for name lookup
    for (const p of patients) {
      if (p.referenceProfessionalId) profIds.add(p.referenceProfessionalId)
    }

    // Fetch all professionals (session + reference) for name lookup
    const allProfessionals = await prisma.professionalProfile.findMany({
      where: { id: { in: Array.from(profIds) } },
      select: { id: true, user: { select: { name: true } } },
    })
    const profMap = new Map(allProfessionals.map(p => [p.id, p]))

    // Stream progress as each group is processed
    const total = byGroup.size
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let generated = 0
        let updated = 0
        let skipped = 0
        let current = 0

        for (const [groupKey, patientApts] of byGroup) {
          const patientId = groupKey.split("|")[0]
          const patient = patientMap.get(patientId)
          if (!patient || !patient.sessionFee) { current++; continue }

          // Resolve billing professional based on split flag
          const splitByProf = patient.splitInvoiceByProfessional
          const billingProfId = splitByProf
            ? patientApts[0].professionalProfileId
            : (patient.referenceProfessionalId || patientApts[0].professionalProfileId)

          current++
          controller.enqueue(encoder.encode(
            JSON.stringify({ type: "progress", current, total, patient: patient.name }) + "\n"
          ))

          const grouping = resolveGrouping(
            clinic?.invoiceGrouping ?? "MONTHLY",
            patient.invoiceGrouping
          )

          // Always set attendingProfessionalId to the actual session professional
          const mappedApts = patientApts.map(a => ({
            id: a.id,
            scheduledAt: a.scheduledAt,
            status: a.status,
            type: a.type,
            title: a.title,
            recurrenceId: a.recurrenceId,
            groupId: a.groupId,
            sessionGroupId: a.sessionGroupId,
            price: a.price ? Number(a.price) : null,
            attendingProfessionalId: a.attendingProfessionalId ?? a.professionalProfileId,
            groupName: a.group?.name ?? null,
          }))

          const referenceProfessional = patient.referenceProfessionalId
            ? (profMap.get(patient.referenceProfessionalId) ?? null)
            : null

          try {
            if (grouping === "PER_SESSION") {
              await prisma.$transaction(async (tx) => {
                const result = await generatePerSessionInvoices(tx, {
                  clinicId: user.clinicId,
                  patientId,
                  profId: billingProfId,
                  month,
                  year,
                  appointments: mappedApts,
                  sessionFee: Number(patient.sessionFee),
                  patientTemplate: patient.invoiceMessageTemplate,
                  clinicTemplate: clinic?.invoiceMessageTemplate ?? null,
                  clinicPaymentInfo: null,
                  profName: profMap.get(billingProfId)?.user?.name || "",
                  patientName: patient.name,
                  motherName: patient.motherName,
                  fatherName: patient.fatherName,
                  showAppointmentDays: patient.showAppointmentDaysOnInvoice,
                  referenceProfessional,
                })
                generated += result.generated
                updated += result.updated
                skipped += result.skipped
              }, { timeout: 15000 })
            } else {
              const dueDate = new Date(Date.UTC(year, month - 1, patient.invoiceDueDay ?? clinicDueDay, 12))
              await prisma.$transaction(async (tx) => {
                const result = await generateMonthlyInvoice(tx, {
                  clinicId: user.clinicId,
                  patientId,
                  professionalProfileId: billingProfId,
                  month,
                  year,
                  dueDate,
                  sessionFee: Number(patient.sessionFee),
                  showAppointmentDays: patient.showAppointmentDaysOnInvoice,
                  profName: profMap.get(billingProfId)?.user?.name || "",
                  billingMode: clinic?.billingMode ?? null,
                  patient: {
                    name: patient.name,
                    motherName: patient.motherName,
                    fatherName: patient.fatherName,
                    invoiceMessageTemplate: patient.invoiceMessageTemplate,
                    referenceProfessional,
                  },
                  clinicInvoiceMessageTemplate: clinic?.invoiceMessageTemplate ?? null,
                  appointments: mappedApts,
                })

                if (result === "generated") generated++
                else if (result === "updated") updated++
                else if (result === "skipped") skipped++
              }, { timeout: 15000 })
            }
          } catch (error) {
            console.error(`[invoice-gen] Error processing patient ${patient.name}:`, error)
          }
        }

        controller.enqueue(encoder.encode(
          JSON.stringify({ type: "done", generated, updated, skipped }) + "\n"
        ))
        controller.close()
      },
    })

    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked" },
    })
  }
)
