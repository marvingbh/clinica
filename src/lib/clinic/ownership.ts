import { prisma } from "@/lib/prisma"

/**
 * Cross-tenant write guards.
 *
 * `withFeatureAuth` confirms a user *may* use a feature but does not validate the
 * foreign-key ids they submit. A clinic-A user could otherwise reference a clinic-B
 * row (professional, expense category, patient, …) and create a cross-tenant link
 * — or read the related row's data back via an `include`. These helpers verify a
 * submitted id belongs to the caller's clinic before it is written.
 */

/** True if the professional profile belongs to the clinic (scoped via its user). */
export async function professionalProfileInClinic(
  professionalProfileId: string,
  clinicId: string
): Promise<boolean> {
  const found = await prisma.professionalProfile.findFirst({
    where: { id: professionalProfileId, user: { clinicId } },
    select: { id: true },
  })
  return found !== null
}

/** True if every professional profile id belongs to the clinic. Empty list → true. */
export async function allProfessionalProfilesInClinic(
  professionalProfileIds: string[],
  clinicId: string
): Promise<boolean> {
  const unique = [...new Set(professionalProfileIds)]
  if (unique.length === 0) return true
  const count = await prisma.professionalProfile.count({
    where: { id: { in: unique }, user: { clinicId } },
  })
  return count === unique.length
}

/** True if the expense category belongs to the clinic. */
export async function expenseCategoryInClinic(
  categoryId: string,
  clinicId: string
): Promise<boolean> {
  const found = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, clinicId },
    select: { id: true },
  })
  return found !== null
}

/** True if the patient belongs to the clinic. */
export async function patientInClinic(
  patientId: string,
  clinicId: string
): Promise<boolean> {
  const found = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true },
  })
  return found !== null
}
