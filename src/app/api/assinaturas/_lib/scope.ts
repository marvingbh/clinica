import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"

/**
 * Returns true when the user may act on signatures for this patient.
 * Mirrors the documents-module scope: ADMIN ⇒ any patient of the clinic;
 * PROFESSIONAL ⇒ only patients they reference or have an appointment with.
 */
export async function canAccessPatientSignatures(
  user: AuthUser,
  patientId: string
): Promise<boolean> {
  if (user.role === "ADMIN") {
    const p = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: user.clinicId },
      select: { id: true },
    })
    return p !== null
  }
  if (!user.professionalProfileId) return false
  const p = await prisma.patient.findFirst({
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
  return p !== null
}

/** Prisma `where` clause limiting an envelope list to patients the user may see. */
export function envelopeListScope(user: AuthUser): Record<string, unknown> {
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
