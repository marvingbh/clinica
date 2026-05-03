import { Prisma } from "@prisma/client"

/**
 * Shared Prisma `select` for the patient fields needed by the invoice
 * generators / recalculators / API surface. Includes the `referenceProfessional`
 * relation so the patient-facing invoice can render "Técnico de referência: X".
 */
export const PATIENT_FOR_INVOICE_SELECT = {
  id: true,
  name: true,
  motherName: true,
  fatherName: true,
  sessionFee: true,
  showAppointmentDaysOnInvoice: true,
  invoiceDueDay: true,
  invoiceMessageTemplate: true,
  invoiceGrouping: true,
  splitInvoiceByProfessional: true,
  referenceProfessionalId: true,
  referenceProfessional: { select: { user: { select: { name: true } } } },
} as const satisfies Prisma.PatientSelect

export type PatientForInvoice = Prisma.PatientGetPayload<{
  select: typeof PATIENT_FOR_INVOICE_SELECT
}>

/**
 * Trimmed patient projection used by the per-fatura `[id]/route.ts`,
 * `[id]/items/route.ts`, and the manual-invoice route — these don't need
 * the grouping / split / due-day fields the generator paths rely on.
 */
export const PATIENT_FOR_INVOICE_RECALC_SELECT = {
  id: true,
  name: true,
  motherName: true,
  fatherName: true,
  sessionFee: true,
  invoiceMessageTemplate: true,
  referenceProfessional: { select: { user: { select: { name: true } } } },
} as const satisfies Prisma.PatientSelect

/**
 * Shared `select` for `Appointment` rows fed into the invoice generators.
 * `groupName` is materialized into the `InvoiceItem.description` at write
 * time, so callers only need the FK and the join here.
 */
export const APPOINTMENT_FOR_INVOICE_SELECT = {
  id: true,
  scheduledAt: true,
  status: true,
  type: true,
  title: true,
  recurrenceId: true,
  groupId: true,
  sessionGroupId: true,
  price: true,
  professionalProfileId: true,
  attendingProfessionalId: true,
  group: { select: { name: true } },
} as const satisfies Prisma.AppointmentSelect

export type AppointmentForInvoiceRow = Prisma.AppointmentGetPayload<{
  select: typeof APPOINTMENT_FOR_INVOICE_SELECT
}>
