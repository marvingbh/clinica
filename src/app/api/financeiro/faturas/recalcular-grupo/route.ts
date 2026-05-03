import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { generatePerSessionInvoices } from "@/lib/financeiro/generate-per-session-invoices"
import { fetchUninvoicedPriorAppointments } from "@/lib/financeiro/uninvoiced-appointments"
import { audit, AuditAction } from "@/lib/rbac/audit"

const schema = z.object({
  patientId: z.string(),
  professionalProfileId: z.string(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
})

/**
 * POST /api/financeiro/faturas/recalcular-grupo
 * Recalculates all per-session invoices for a patient+professional+month.
 * Cancels existing PENDENTE per-session invoices and regenerates them,
 * applying any available credits (e.g., from cancelled appointments).
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { patientId, professionalProfileId, month, year } = parsed.data

    const [patient, clinic, professional] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: patientId, clinicId: user.clinicId },
        select: {
          id: true, name: true, motherName: true, fatherName: true,
          sessionFee: true, showAppointmentDaysOnInvoice: true,
          invoiceMessageTemplate: true,
          referenceProfessional: { select: { user: { select: { name: true } } } },
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

    if (!patient || !patient.sessionFee) {
      return NextResponse.json({ error: "Paciente sem valor de sessão" }, { status: 400 })
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)

    const [monthApts, uninvoicedPriorApts] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId, patientId, professionalProfileId,
          scheduledAt: { gte: startDate, lt: endDate },
          type: { in: ["CONSULTA", "REUNIAO"] },
        },
        select: {
          id: true, scheduledAt: true, status: true, type: true, title: true,
          recurrenceId: true, groupId: true, sessionGroupId: true, price: true,
          attendingProfessionalId: true,
          group: { select: { name: true } },
        },
      }),
      fetchUninvoicedPriorAppointments(prisma, {
        clinicId: user.clinicId, patientId, professionalProfileId,
        beforeDate: startDate,
      }),
    ])

    const appointments = [...monthApts, ...uninvoicedPriorApts]

    const mappedApts = appointments.map(a => {
      const withGroup = a as typeof a & { group?: { name: string } | null }
      return {
        ...a,
        price: a.price ? Number(a.price) : null,
        groupName: withGroup.group?.name ?? null,
      }
    })

    const profName = professional?.user?.name || ""

    await prisma.$transaction(async (tx) => {
      await generatePerSessionInvoices(tx, {
        clinicId: user.clinicId,
        patientId,
        profId: professionalProfileId,
        month,
        year,
        appointments: mappedApts,
        sessionFee: Number(patient.sessionFee),
        patientTemplate: patient.invoiceMessageTemplate,
        clinicTemplate: clinic?.invoiceMessageTemplate ?? null,
        clinicPaymentInfo: null,
        profName,
        patientName: patient.name,
        motherName: patient.motherName,
        fatherName: patient.fatherName,
        showAppointmentDays: patient.showAppointmentDaysOnInvoice,
        referenceProfessional: patient.referenceProfessional ?? null,
      })
    }, { timeout: 15000 })

    audit.log({
      user, action: AuditAction.INVOICE_RECALCULATED, entityType: "Invoice",
      entityId: `group:${patientId}:${month}:${year}`,
      newValues: { patientName: patient.name, month, year, type: "PER_SESSION_GROUP" },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ success: true, message: "Grupo recalculado com sucesso" })
  }
)
