import { prisma } from "@/lib/prisma"
import type { AppointmentType, AppointmentStatus } from "@prisma/client"

/**
 * Thrown when a record does not belong to the caller's clinic.
 * API routes map this to HTTP 404 (never 403) so existence cannot be
 * probed across tenants.
 */
export class OwnershipError extends Error {
  constructor(message = "Recurso nao encontrado") {
    super(message)
    this.name = "OwnershipError"
  }
}

/**
 * Shape returned by {@link assertAppointmentInClinic}. Only the fields needed
 * by the prontuário flows are selected.
 */
export interface OwnedAppointment {
  id: string
  type: AppointmentType
  patientId: string | null
  scheduledAt: Date
  status: AppointmentStatus
  professionalProfileId: string
  attendingProfessionalId: string | null
}

/** Throws {@link OwnershipError} if the patient is not in the clinic. */
export async function assertPatientInClinic(
  clinicId: string,
  patientId: string
): Promise<void> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true },
  })
  if (!patient) throw new OwnershipError()
}

/**
 * Throws {@link OwnershipError} if the appointment is not in the clinic.
 * Returns the appointment fields needed for note linkage.
 */
export async function assertAppointmentInClinic(
  clinicId: string,
  appointmentId: string
): Promise<OwnedAppointment> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
    select: {
      id: true,
      type: true,
      patientId: true,
      scheduledAt: true,
      status: true,
      professionalProfileId: true,
      attendingProfessionalId: true,
    },
  })
  if (!appointment) throw new OwnershipError()
  return appointment
}

/** Throws {@link OwnershipError} if the professional profile is not in the clinic. */
export async function assertProfessionalInClinic(
  clinicId: string,
  professionalProfileId: string
): Promise<void> {
  const professional = await prisma.professionalProfile.findFirst({
    where: { id: professionalProfileId, user: { clinicId } },
    select: { id: true },
  })
  if (!professional) throw new OwnershipError()
}

/** Boolean: does this patient belong to the clinic? (non-throwing variant) */
export async function patientBelongsToClinic(
  patientId: string,
  clinicId: string
): Promise<boolean> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true },
  })
  return patient !== null
}

/** Boolean: does this professional profile belong to the clinic? (non-throwing) */
export async function professionalBelongsToClinic(
  professionalProfileId: string,
  clinicId: string
): Promise<boolean> {
  const professional = await prisma.professionalProfile.findFirst({
    where: { id: professionalProfileId, user: { clinicId } },
    select: { id: true },
  })
  return professional !== null
}

/**
 * Throws {@link OwnershipError} if any of the invoice ids does not belong to the
 * clinic. Used by the fiscal export route to validate ids coming from the body.
 * Deduplicates and ignores empty input.
 */
export async function assertInvoicesInClinic(
  clinicId: string,
  invoiceIds: string[]
): Promise<void> {
  const unique = [...new Set(invoiceIds)].filter(Boolean)
  if (unique.length === 0) return
  const found = await prisma.invoice.count({
    where: { id: { in: unique }, clinicId },
  })
  if (found !== unique.length) throw new OwnershipError()
}

/**
 * Throws {@link OwnershipError} if any of the reconciliation-link ids does not
 * belong to the clinic. Deduplicates and ignores empty input.
 */
export async function assertReconciliationLinksInClinic(
  clinicId: string,
  linkIds: string[]
): Promise<void> {
  const unique = [...new Set(linkIds)].filter(Boolean)
  if (unique.length === 0) return
  const found = await prisma.reconciliationLink.count({
    where: { id: { in: unique }, clinicId },
  })
  if (found !== unique.length) throw new OwnershipError()
}

/**
 * Throws {@link OwnershipError} if any of the invoice-item ids does not belong
 * to the clinic (via its invoice) and, when provided, to the given patient.
 * Used by the reembolso flow to validate item ids coming from the body.
 * Deduplicates and ignores empty input.
 */
export async function assertInvoiceItemsInClinic(
  clinicId: string,
  invoiceItemIds: string[],
  patientId?: string
): Promise<void> {
  const unique = [...new Set(invoiceItemIds)].filter(Boolean)
  if (unique.length === 0) return
  const found = await prisma.invoiceItem.count({
    where: {
      id: { in: unique },
      invoice: { clinicId, ...(patientId ? { patientId } : {}) },
    },
  })
  if (found !== unique.length) throw new OwnershipError()
}
