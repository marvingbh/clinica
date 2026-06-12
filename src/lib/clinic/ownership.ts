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
