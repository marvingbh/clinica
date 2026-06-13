import type { Role } from "@prisma/client"

/**
 * Decides whether a staff user may read a response's CONTENT (the answers).
 * ADMIN always may (clinic-wide clinical access, parity with `patients`).
 * A PROFESSIONAL may only when they are the patient's reference professional
 * or the user who sent the form. Metadata (status/dates) is governed by the
 * route's READ gate, not by this function.
 */
export function canAccessResponseContent(input: {
  role: Role
  userProfessionalProfileId: string | null
  patientReferenceProfessionalId: string | null
  responseProfessionalProfileId: string | null
  responseSentByUserId: string | null
  userId: string
}): boolean {
  if (input.role === "ADMIN") return true

  const pid = input.userProfessionalProfileId
  if (pid && pid === input.patientReferenceProfessionalId) return true
  if (pid && pid === input.responseProfessionalProfileId) return true
  if (input.responseSentByUserId && input.responseSentByUserId === input.userId) return true

  return false
}
