import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { normalizePhone } from "@/lib/phone"
import { checkConflict, formatConflictError } from "@/lib/appointments/conflict-check"

export interface NewPatientInput {
  name: string
  phone: string
  email?: string
  cpf?: string
}

export type ApproveOutcome =
  | { kind: "not_found" }
  | { kind: "not_pending" }
  | { kind: "expired" }
  | { kind: "bad_patient" }
  | { kind: "conflict"; error: ReturnType<typeof formatConflictError> }
  | { kind: "ok"; appointmentId: string; patientId: string }

interface ApproveParams {
  requestId: string
  clinicId: string
  userId: string
  restrictToProfessionalId: string | null // PROFESSIONAL acting on own only
  linkPatientId?: string
  newPatient?: NewPatientInput
}

/**
 * Approves a booking request inside a transaction: re-validates the slot with
 * checkConflict (FOR UPDATE), resolves/creates the patient, creates the
 * appointment and marks the request APPROVED. All access is clinic-scoped.
 */
export async function approveBookingRequest(params: ApproveParams): Promise<ApproveOutcome> {
  const { requestId, clinicId, userId, restrictToProfessionalId, linkPatientId, newPatient } = params
  const now = new Date()

  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.bookingRequest.findFirst({
        where: { id: requestId, clinicId },
      })
      if (!request) return { kind: "not_found" } as const
      if (restrictToProfessionalId && request.professionalProfileId !== restrictToProfessionalId) {
        return { kind: "not_found" } as const
      }
      if (request.status !== "PENDING") return { kind: "not_pending" } as const
      if (request.scheduledAt < now) return { kind: "expired" } as const

      // Resolve the patient.
      let patientId: string
      let sessionFee: Prisma.Decimal | null = null

      if (newPatient) {
        const phone = normalizePhone(newPatient.phone)
        const cpf = newPatient.cpf ? newPatient.cpf.replace(/\D/g, "") : null
        if (cpf) {
          const existing = await tx.patient.findUnique({
            where: { clinicId_cpf: { clinicId, cpf } },
          })
          if (existing) return { kind: "bad_patient" } as const
        }
        const created = await tx.patient.create({
          data: {
            clinicId,
            name: newPatient.name,
            phone,
            email: newPatient.email || null,
            cpf,
            // LGPD consents carried from the public submission, timestamped at
            // approval (we don't have the original consent moment per-channel
            // beyond consentAt, so use the request's consents as the source).
            consentWhatsApp: request.consentWhatsApp,
            consentWhatsAppAt: request.consentWhatsApp ? request.consentAt : null,
            consentEmail: request.consentEmail,
            consentEmailAt: request.consentEmail ? request.consentAt : null,
          },
          select: { id: true, sessionFee: true },
        })
        patientId = created.id
        sessionFee = created.sessionFee
      } else {
        const resolvedId = linkPatientId ?? request.patientId
        if (!resolvedId) return { kind: "bad_patient" } as const
        const patient = await tx.patient.findFirst({
          where: { id: resolvedId, clinicId },
          select: { id: true, sessionFee: true, consentWhatsApp: true, consentEmail: true },
        })
        if (!patient) return { kind: "bad_patient" } as const
        patientId = patient.id
        sessionFee = patient.sessionFee

        // Turn on consents newly granted by the booking (never turn off).
        const consentUpdate: Prisma.PatientUpdateInput = {}
        if (request.consentWhatsApp && !patient.consentWhatsApp) {
          consentUpdate.consentWhatsApp = true
          consentUpdate.consentWhatsAppAt = request.consentAt
        }
        if (request.consentEmail && !patient.consentEmail) {
          consentUpdate.consentEmail = true
          consentUpdate.consentEmailAt = request.consentAt
        }
        if (Object.keys(consentUpdate).length > 0) {
          await tx.patient.update({ where: { id: patient.id }, data: consentUpdate })
        }
      }

      // Re-validate the slot under a row lock.
      const conflict = await checkConflict(
        {
          professionalProfileId: request.professionalProfileId,
          scheduledAt: request.scheduledAt,
          endAt: request.endAt,
        },
        tx
      )
      if (conflict.hasConflict && conflict.conflictingAppointment) {
        return { kind: "conflict", error: formatConflictError(conflict.conflictingAppointment) } as const
      }

      const appointment = await tx.appointment.create({
        data: {
          clinicId,
          professionalProfileId: request.professionalProfileId,
          patientId,
          type: "CONSULTA",
          status: "AGENDADO",
          blocksTime: true,
          scheduledAt: request.scheduledAt,
          endAt: request.endAt,
          modality: request.modality,
          price: sessionFee ?? null,
        },
        select: { id: true },
      })

      await tx.bookingRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          patientId,
          appointmentId: appointment.id,
          reviewedByUserId: userId,
          reviewedAt: now,
        },
      })

      return { kind: "ok", appointmentId: appointment.id, patientId } as const
    })
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return { kind: "bad_patient" }
    }
    throw err
  }
}
