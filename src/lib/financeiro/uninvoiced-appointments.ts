import { Prisma } from "@prisma/client"

const BILLABLE_STATUSES = [
  "AGENDADO",
  "CONFIRMADO",
  "FINALIZADO",
  "CANCELADO_FALTA",
  "CANCELADO_ACORDADO",
]
const INVOICEABLE_TYPES = ["CONSULTA", "REUNIAO"]

/** Max months to look back for uninvoiced appointments (only prior month) */
const LOOKBACK_MONTHS = 1

const appointmentSelect = {
  id: true, scheduledAt: true, status: true, type: true, title: true,
  recurrenceId: true, groupId: true, sessionGroupId: true, price: true,
  attendingProfessionalId: true,
  group: { select: { name: true } },
} as const

type AppointmentSelect = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>

/**
 * Fetch appointments from prior months that were never invoiced.
 * For example, a group session created after that month's invoice was already generated.
 *
 * Uses a 6-month lookback to avoid scanning the entire appointment history,
 * and filters to billable statuses only.
 */
export async function fetchUninvoicedPriorAppointments(
  client: Prisma.TransactionClient | { appointment: { findMany: (...args: unknown[]) => Promise<AppointmentSelect[]> } },
  params: {
    clinicId: string
    patientId: string
    professionalProfileId: string
    beforeDate: Date
  }
): Promise<AppointmentSelect[]> {
  const { clinicId, patientId, professionalProfileId, beforeDate } = params
  const lookbackDate = new Date(beforeDate)
  lookbackDate.setMonth(lookbackDate.getMonth() - LOOKBACK_MONTHS)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).appointment.findMany({
    where: {
      clinicId,
      patientId,
      professionalProfileId,
      scheduledAt: { gte: lookbackDate, lt: beforeDate },
      type: { in: INVOICEABLE_TYPES },
      status: { in: BILLABLE_STATUSES },
      invoiceItems: { none: {} },
    },
    select: appointmentSelect,
  })
}

/**
 * Bulk version: fetch uninvoiced prior appointments for multiple patients at once.
 * Used by the batch invoice generation route.
 */
export async function fetchUninvoicedPriorAppointmentsBulk(
  client: { appointment: { findMany: (...args: unknown[]) => Promise<(AppointmentSelect & { patientId: string | null; professionalProfileId: string })[]> } },
  params: {
    clinicId: string
    /**
     * Restrict to these patients. Omit to sweep the whole clinic — this is what lets
     * past-month uninvoiced sessions get billed even when the patient has no appointment
     * in the target month.
     */
    patientIds?: string[]
    /** Restrict to a single professional (used when generating one professional's invoices). */
    professionalProfileId?: string
    beforeDate: Date
    /** Also include appointments invoiced only in PENDENTE invoices for this month/year (will be rebuilt) */
    targetMonth?: number
    targetYear?: number
  }
): Promise<(AppointmentSelect & { patientId: string | null; professionalProfileId: string })[]> {
  const { clinicId, patientIds, professionalProfileId, beforeDate, targetMonth, targetYear } = params
  const lookbackDate = new Date(beforeDate)
  lookbackDate.setMonth(lookbackDate.getMonth() - LOOKBACK_MONTHS)

  // Include appointments that are either uninvoiced OR only invoiced in PENDENTE invoices
  // for the target month (since those invoices will be regenerated)
  const invoiceItemFilter = targetMonth && targetYear
    ? {
        OR: [
          { invoiceItems: { none: {} } },
          {
            invoiceItems: {
              every: {
                invoice: {
                  referenceMonth: targetMonth,
                  referenceYear: targetYear,
                  status: "PENDENTE",
                },
              },
            },
          },
        ],
      }
    : { invoiceItems: { none: {} } }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).appointment.findMany({
    where: {
      clinicId,
      ...(patientIds ? { patientId: { in: patientIds } } : {}),
      ...(professionalProfileId ? { professionalProfileId } : {}),
      scheduledAt: { gte: lookbackDate, lt: beforeDate },
      type: { in: INVOICEABLE_TYPES },
      status: { in: BILLABLE_STATUSES },
      ...invoiceItemFilter,
    },
    select: {
      ...appointmentSelect,
      patientId: true,
      professionalProfileId: true,
    },
  })
}
