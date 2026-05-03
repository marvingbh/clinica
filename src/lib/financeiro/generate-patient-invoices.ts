import { prisma } from "@/lib/prisma"
import { generateMonthlyInvoice } from "./generate-monthly-invoice"
import { generatePerSessionInvoices } from "./generate-per-session-invoices"
import { resolveGrouping } from "./invoice-grouping"
import { fetchUninvoicedPriorAppointmentsBulk } from "./uninvoiced-appointments"

interface PatientData {
  id: string
  name: string
  motherName: string | null
  fatherName: string | null
  sessionFee: number
  showAppointmentDaysOnInvoice: boolean
  invoiceDueDay: number | null
  invoiceMessageTemplate: string | null
  invoiceGrouping: string | null
  splitInvoiceByProfessional: boolean
  referenceProfessionalId: string | null
}

interface ClinicData {
  invoiceDueDay: number | null
  invoiceMessageTemplate: string | null
  billingMode: string | null
  invoiceGrouping: string | null
}

/**
 * Generate (or regenerate) invoices for a single patient in a given month.
 * Handles both consolidated and split-by-professional modes.
 * Deletes existing non-PAGO invoices before regenerating.
 */
export async function generateInvoicesForPatient(params: {
  clinicId: string
  patient: PatientData
  clinic: ClinicData
  month: number
  year: number
}): Promise<{ generated: number; updated: number; skipped: number }> {
  const { clinicId, patient, clinic, month, year } = params
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 1)
  const clinicDueDay = clinic.invoiceDueDay ?? 15

  // 1. Delete existing non-PAGO invoices for this patient+month, release credits
  const toDelete = await prisma.invoice.findMany({
    where: { clinicId, patientId: patient.id, referenceMonth: month, referenceYear: year, status: { notIn: ["PAGO"] } },
    select: { id: true },
  })
  for (const inv of toDelete) {
    await prisma.sessionCredit.updateMany({ where: { consumedByInvoiceId: inv.id }, data: { consumedByInvoiceId: null, consumedAt: null } })
  }
  if (toDelete.length > 0) {
    await prisma.invoice.deleteMany({ where: { id: { in: toDelete.map(i => i.id) } } })
  }

  // 2. Fetch all appointments (current month + prior uninvoiced)
  const monthApts = await prisma.appointment.findMany({
    where: { clinicId, patientId: patient.id, scheduledAt: { gte: startDate, lt: endDate }, type: { in: ["CONSULTA", "REUNIAO"] } },
    select: {
      id: true, scheduledAt: true, status: true, type: true, title: true,
      recurrenceId: true, groupId: true, sessionGroupId: true, price: true,
      professionalProfileId: true, attendingProfessionalId: true,
      group: { select: { name: true } },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priorApts = await fetchUninvoicedPriorAppointmentsBulk(prisma as any, {
    clinicId, patientIds: [patient.id], beforeDate: startDate,
    targetMonth: month, targetYear: year,
  })

  const allApts = [
    ...monthApts.map(a => ({ ...a, patientId: patient.id })),
    ...priorApts.filter(a => !monthApts.some(m => m.id === a.id)),
  ]

  if (allApts.length === 0) return { generated: 0, updated: 0, skipped: 0 }

  // 3. Group by professional (split) or single group (consolidated)
  const groups = new Map<string, typeof allApts>()
  for (const apt of allApts) {
    const key = patient.splitInvoiceByProfessional ? apt.professionalProfileId : "consolidated"
    const list = groups.get(key) || []
    list.push(apt)
    groups.set(key, list)
  }

  // 4. Collect professional IDs and fetch names
  const profIds = new Set<string>()
  for (const apts of groups.values()) for (const a of apts) profIds.add(a.professionalProfileId)
  if (patient.referenceProfessionalId) profIds.add(patient.referenceProfessionalId)
  const professionals = await prisma.professionalProfile.findMany({
    where: { id: { in: Array.from(profIds) } },
    select: { id: true, user: { select: { name: true } } },
  })
  const profMap = new Map(professionals.map(p => [p.id, p]))

  const grouping = resolveGrouping(
    (clinic.invoiceGrouping ?? "MONTHLY") as "MONTHLY" | "PER_SESSION",
    (patient.invoiceGrouping as "MONTHLY" | "PER_SESSION" | null) ?? null
  )

  let generated = 0, updated = 0, skipped = 0

  // 5. Generate invoice per group
  for (const [key, apts] of groups) {
    const billingProfId = patient.splitInvoiceByProfessional
      ? key
      : (patient.referenceProfessionalId || apts[0].professionalProfileId)

    const mappedApts = apts.map(a => ({
      id: a.id, scheduledAt: a.scheduledAt, status: a.status, type: a.type, title: a.title,
      recurrenceId: a.recurrenceId, groupId: a.groupId, sessionGroupId: a.sessionGroupId,
      price: a.price ? Number(a.price) : null,
      attendingProfessionalId: (a.attendingProfessionalId ?? a.professionalProfileId) as string | null,
      groupName: (a as { group?: { name: string } | null }).group?.name ?? null,
    }))

    const referenceProfessional = patient.referenceProfessionalId
      ? (profMap.get(patient.referenceProfessionalId) ?? null)
      : null

    try {
      if (grouping === "PER_SESSION") {
        await prisma.$transaction(async (tx) => {
          const result = await generatePerSessionInvoices(tx, {
            clinicId, patientId: patient.id, profId: billingProfId,
            month, year, appointments: mappedApts,
            sessionFee: patient.sessionFee,
            patientTemplate: patient.invoiceMessageTemplate,
            clinicTemplate: clinic.invoiceMessageTemplate ?? null,
            clinicPaymentInfo: null,
            profName: profMap.get(billingProfId)?.user?.name || "",
            patientName: patient.name, motherName: patient.motherName, fatherName: patient.fatherName,
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
            clinicId, patientId: patient.id, professionalProfileId: billingProfId,
            month, year, dueDate,
            sessionFee: patient.sessionFee,
            showAppointmentDays: patient.showAppointmentDaysOnInvoice,
            profName: profMap.get(billingProfId)?.user?.name || "",
            billingMode: clinic.billingMode ?? null,
            patient: {
              name: patient.name, motherName: patient.motherName, fatherName: patient.fatherName,
              invoiceMessageTemplate: patient.invoiceMessageTemplate,
              referenceProfessional,
            },
            clinicInvoiceMessageTemplate: clinic.invoiceMessageTemplate ?? null,
            appointments: mappedApts,
          })
          if (result === "generated") generated++
          else if (result === "updated") updated++
          else if (result === "skipped") skipped++
        }, { timeout: 15000 })
      }
    } catch (error) {
      console.error(`[invoice-gen] Error for patient ${patient.name}:`, error)
    }
  }

  return { generated, updated, skipped }
}
