import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { generateMonthlyInvoice } from "@/lib/financeiro/generate-monthly-invoice"
import { generatePerSessionInvoices } from "@/lib/financeiro/generate-per-session-invoices"
import { resolveGrouping } from "@/lib/financeiro/invoice-grouping"
import { fetchUninvoicedPriorAppointmentsBulk } from "@/lib/financeiro/uninvoiced-appointments"

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
      select: {
        id: true, scheduledAt: true, status: true, type: true, title: true,
        recurrenceId: true, groupId: true, sessionGroupId: true, price: true,
        patientId: true, professionalProfileId: true, attendingProfessionalId: true,
      },
    })

    // Step 4: Group by patientId only (one consolidated invoice per patient)
    // All sessions go into one invoice under the patient's reference professional.
    const byPatient = new Map<string, typeof allAppointments>()
    for (const apt of allAppointments) {
      if (!apt.patientId) continue
      const list = byPatient.get(apt.patientId) || []
      list.push(apt)
      byPatient.set(apt.patientId, list)
    }

    // Load patient + clinic data early (needed for cleanup step)
    const [patients, clinic] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: {
          id: true, name: true, motherName: true, fatherName: true,
          sessionFee: true, showAppointmentDaysOnInvoice: true,
          invoiceDueDay: true, invoiceMessageTemplate: true, referenceProfessionalId: true,
          invoiceGrouping: true,
        },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceDueDay: true, invoiceMessageTemplate: true, billingMode: true, invoiceGrouping: true },
      }),
    ])

    // Step 4b: Clean up orphaned invoices from old per-professional grouping.
    // Delete PENDENTE invoices under a different professional than the billing professional.
    // This must run BEFORE fetching uninvoiced prior appointments so freed items are detected.
    for (const p of patients) {
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

    // Step 4c: Fetch uninvoiced prior appointments (now includes items freed by cleanup above)
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
      const list = byPatient.get(apt.patientId) || []
      if (!list.some(a => a.id === apt.id)) {
        list.push(apt)
        byPatient.set(apt.patientId, list)
      }
    }

    // Collect unique professional IDs for name lookup (from appointments + reference professionals)
    const profIds = new Set<string>()
    for (const apts of byPatient.values()) {
      for (const a of apts) profIds.add(a.professionalProfileId)
    }

    const patientMap = new Map(patients.map(p => [p.id, p]))
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

    // Stream progress as each patient is processed
    const total = byPatient.size
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let generated = 0
        let updated = 0
        let skipped = 0
        let current = 0

        for (const [patientId, patientApts] of byPatient) {
          const patient = patientMap.get(patientId)
          if (!patient || !patient.sessionFee) { current++; continue }

          // Resolve billing professional: reference professional > first appointment's professional
          const billingProfId = patient.referenceProfessionalId || patientApts[0].professionalProfileId

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
          }))

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
