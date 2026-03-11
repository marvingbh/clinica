import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { generateMonthlyInvoice } from "@/lib/financeiro/generate-monthly-invoice"

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

    // Step 3: Fetch ALL appointments for those patients (no professional filter)
    const allAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId: { in: patientIds },
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true, title: true,
        recurrenceId: true, groupId: true, price: true,
        patientId: true, professionalProfileId: true,
      },
    })

    // Step 4: Group by patientId + professionalProfileId (one invoice per combination)
    const byPatientAndProfessional = new Map<string, typeof allAppointments>()
    for (const apt of allAppointments) {
      if (!apt.patientId) continue
      const key = `${apt.patientId}|${apt.professionalProfileId}`
      const list = byPatientAndProfessional.get(key) || []
      list.push(apt)
      byPatientAndProfessional.set(key, list)
    }

    // Collect unique professional IDs for name lookup
    const profIds = new Set<string>()
    for (const apts of byPatientAndProfessional.values()) {
      for (const a of apts) profIds.add(a.professionalProfileId)
    }

    const [patients, clinic, professionals] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: {
          id: true, name: true, motherName: true, fatherName: true,
          sessionFee: true, showAppointmentDaysOnInvoice: true,
          invoiceDueDay: true, invoiceMessageTemplate: true, referenceProfessionalId: true,
        },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceDueDay: true, invoiceMessageTemplate: true, billingMode: true },
      }),
      prisma.professionalProfile.findMany({
        where: { id: { in: Array.from(profIds) } },
        select: { id: true, user: { select: { name: true } } },
      }),
    ])

    const patientMap = new Map(patients.map(p => [p.id, p]))
    const profMap = new Map(professionals.map(p => [p.id, p]))

    const clinicDueDay = clinic?.invoiceDueDay ?? 15

    // Process each patient individually (not in a single transaction)
    // to avoid Vercel function timeouts with large patient counts
    let generated = 0
    let updated = 0
    let skipped = 0

    for (const [key, patientApts] of byPatientAndProfessional) {
      const [patientId, profId] = key.split("|")
      const patient = patientMap.get(patientId)
      if (!patient || !patient.sessionFee) continue

      const dueDate = new Date(Date.UTC(year, month - 1, patient.invoiceDueDay ?? clinicDueDay, 12))

      try {
        await prisma.$transaction(async (tx) => {
          const result = await generateMonthlyInvoice(tx, {
            clinicId: user.clinicId,
            patientId,
            professionalProfileId: profId,
            month,
            year,
            dueDate,
            sessionFee: Number(patient.sessionFee),
            showAppointmentDays: patient.showAppointmentDaysOnInvoice,
            profName: profMap.get(profId)?.user?.name || "",
            billingMode: clinic?.billingMode ?? null,
            patient: {
              name: patient.name,
              motherName: patient.motherName,
              fatherName: patient.fatherName,
              invoiceMessageTemplate: patient.invoiceMessageTemplate,
            },
            clinicInvoiceMessageTemplate: clinic?.invoiceMessageTemplate ?? null,
            appointments: patientApts.map(a => ({
              id: a.id,
              scheduledAt: a.scheduledAt,
              status: a.status,
              type: a.type,
              title: a.title,
              recurrenceId: a.recurrenceId,
              groupId: a.groupId,
              price: a.price ? Number(a.price) : null,
            })),
          })

          if (result === "generated") generated++
          else if (result === "updated") updated++
          else if (result === "skipped") skipped++
        }, { timeout: 15000 })
      } catch (error) {
        console.error(`[invoice-gen] Error processing patient ${patient.name}:`, error)
      }
    }

    const results = { generated, updated, skipped }

    return NextResponse.json(results, { status: 201 })
  }
)
