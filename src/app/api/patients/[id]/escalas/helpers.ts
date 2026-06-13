import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import type { FeatureAccess } from "@prisma/client"
import { OwnershipError } from "@/lib/clinic/ownership"
import { canManageScales, canViewScaleContent } from "@/lib/scales"
import { hasPatientConsent } from "@/lib/jobs/send-reminders"

export interface PatientScaleContext {
  patientId: string
  patientName: string
  referenceProfessionalId: string | null
  /** The professional responsible for this scale action. */
  professionalProfileId: string
  consent: { whatsapp: boolean; email: boolean }
}

/**
 * Loads the patient (clinic-scoped), resolves the responsible professional
 * (the viewer when a professional, else the patient's reference professional),
 * and enforces the treating-professional cut. Throws {@link OwnershipError}
 * (→ 404) when the patient isn't in the clinic, and {@link ScaleAccessError}
 * (→ 403) when the viewer cannot manage the patient's scales.
 */
export async function loadManageContext(
  user: AuthUser,
  access: FeatureAccess,
  patientId: string
): Promise<PatientScaleContext> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId },
    select: {
      id: true,
      name: true,
      referenceProfessionalId: true,
      consentWhatsApp: true,
      phone: true,
      consentEmail: true,
      email: true,
    },
  })
  if (!patient) throw new OwnershipError()

  const professionalProfileId =
    user.professionalProfileId ?? patient.referenceProfessionalId
  if (!professionalProfileId) {
    throw new ScaleAccessError(
      "Defina um profissional de referência para o paciente antes de enviar escalas."
    )
  }

  const hasAppointment =
    user.professionalProfileId !== null &&
    (await prisma.appointment.count({
      where: {
        clinicId: user.clinicId,
        patientId,
        professionalProfileId: user.professionalProfileId,
      },
    })) > 0

  const allowed = canManageScales({
    viewerRole: user.role,
    viewerEscalasAccess: access,
    viewerProfessionalProfileId: user.professionalProfileId,
    patientReferenceProfessionalId: patient.referenceProfessionalId,
    viewerHasAppointmentWithPatient: hasAppointment,
  })
  if (!allowed) {
    throw new ScaleAccessError("Acesso negado às escalas deste paciente")
  }

  const consent = hasPatientConsent({
    consentWhatsApp: patient.consentWhatsApp,
    phone: patient.phone,
    consentEmail: patient.consentEmail,
    email: patient.email,
  })

  return {
    patientId: patient.id,
    patientName: patient.name,
    referenceProfessionalId: patient.referenceProfessionalId,
    professionalProfileId,
    consent,
  }
}

/** Same as {@link loadManageContext} but requires only view access (READ). */
export async function assertCanViewPatientScales(
  user: AuthUser,
  access: FeatureAccess,
  patientId: string
): Promise<{ referenceProfessionalId: string | null }> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId },
    select: { id: true, referenceProfessionalId: true },
  })
  if (!patient) throw new OwnershipError()

  const hasAppointment =
    user.professionalProfileId !== null &&
    (await prisma.appointment.count({
      where: {
        clinicId: user.clinicId,
        patientId,
        professionalProfileId: user.professionalProfileId,
      },
    })) > 0

  const allowed = canViewScaleContent({
    viewerRole: user.role,
    viewerEscalasAccess: access,
    viewerProfessionalProfileId: user.professionalProfileId,
    patientReferenceProfessionalId: patient.referenceProfessionalId,
    viewerHasAppointmentWithPatient: hasAppointment,
  })
  if (!allowed) throw new ScaleAccessError("Acesso negado às escalas deste paciente")

  return { referenceProfessionalId: patient.referenceProfessionalId }
}

/** Thrown when the viewer cannot manage/view the patient's scales (→ 403). */
export class ScaleAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScaleAccessError"
  }
}
