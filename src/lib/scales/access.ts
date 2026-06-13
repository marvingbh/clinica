/**
 * Pure RBAC decisions for clinical-scale content. The `escalas` feature gates
 * the access level; this adds the "tratante" cut for PROFESSIONAL: a
 * professional may only see scales of patients they treat (they are the
 * patient's reference professional OR they have an appointment with them).
 *
 * ADMIN never gets the tratante cut — an ADMIN with an explicit READ/WRITE
 * override (clinical director) sees content; default NONE sees nothing.
 */

export interface ScaleAccessInput {
  viewerRole: "ADMIN" | "PROFESSIONAL"
  viewerEscalasAccess: "NONE" | "READ" | "WRITE"
  viewerProfessionalProfileId: string | null
  patientReferenceProfessionalId: string | null
  viewerHasAppointmentWithPatient: boolean
}

function isTreatingProfessional(input: ScaleAccessInput): boolean {
  if (input.viewerProfessionalProfileId === null) return false
  if (
    input.patientReferenceProfessionalId !== null &&
    input.patientReferenceProfessionalId === input.viewerProfessionalProfileId
  ) {
    return true
  }
  return input.viewerHasAppointmentWithPatient
}

/** Can the viewer read clinical scale content (scores/answers/risk)? */
export function canViewScaleContent(input: ScaleAccessInput): boolean {
  const hasRead =
    input.viewerEscalasAccess === "READ" || input.viewerEscalasAccess === "WRITE"
  if (!hasRead) return false
  if (input.viewerRole === "ADMIN") return true
  return isTreatingProfessional(input)
}

/** Can the viewer manage scales (send/schedule/resend) for the patient? */
export function canManageScales(input: ScaleAccessInput): boolean {
  if (input.viewerEscalasAccess !== "WRITE") return false
  if (input.viewerRole === "ADMIN") return true
  return isTreatingProfessional(input)
}
