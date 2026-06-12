import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"

/**
 * Returns true when the user may act on documents for this patient.
 *
 * ADMIN: any patient of the clinic.
 * PROFESSIONAL: only patients they have a link with — referenceProfessional or
 * at least one appointment with them.
 */
export async function canAccessPatientDocuments(
  user: AuthUser,
  patientId: string
): Promise<boolean> {
  if (user.role === "ADMIN") {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: user.clinicId },
      select: { id: true },
    })
    return patient !== null
  }

  if (!user.professionalProfileId) return false

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      clinicId: user.clinicId,
      OR: [
        { referenceProfessionalId: user.professionalProfileId },
        { appointments: { some: { professionalProfileId: user.professionalProfileId } } },
      ],
    },
    select: { id: true },
  })
  return patient !== null
}

/**
 * Build the Prisma `where` clause that limits a GeneratedDocument list query to
 * patients the user may see.
 */
export function documentListScope(user: AuthUser): Record<string, unknown> {
  if (user.role === "ADMIN" || !user.professionalProfileId) {
    return { clinicId: user.clinicId }
  }
  return {
    clinicId: user.clinicId,
    patient: {
      OR: [
        { referenceProfessionalId: user.professionalProfileId },
        { appointments: { some: { professionalProfileId: user.professionalProfileId } } },
      ],
    },
  }
}
