/**
 * Tenant-scope filter for patient queries.
 *
 * PROFESSIONAL users without `patients_others` access see only patients whose
 * appointments are attended by them (either as main professional or as the
 * `attendingProfessionalId` substitute). ADMIN or anyone with `patients_others`
 * sees all patients in the clinic.
 */

import type { Prisma } from "@prisma/client"
import type { AuthUser } from "../rbac/types"

export function patientScopeFilter(user: AuthUser): Prisma.PatientWhereInput {
  const canSeeOthers = user.permissions.patients_others === "WRITE" || user.permissions.patients_others === "READ"
  if (user.role === "ADMIN" || canSeeOthers) return {}
  if (!user.professionalProfileId) {
    // No professional profile and no others access → see nothing to be safe.
    return { id: "__none__" }
  }
  const profId = user.professionalProfileId
  return {
    OR: [
      { referenceProfessionalId: profId },
      { appointments: { some: { professionalProfileId: profId } } },
      { appointments: { some: { attendingProfessionalId: profId } } },
    ],
  }
}

export function canSeeAllPatients(user: AuthUser): boolean {
  if (user.role === "ADMIN") return true
  return user.permissions.patients_others === "WRITE" || user.permissions.patients_others === "READ"
}
