import type { Prisma } from "@prisma/client"

/**
 * Builds the Prisma `where` fragment that scopes waitlist entries to what a
 * user may see. A user WITHOUT agenda_others READ sees only entries that cite
 * their own professional profile or "qualquer profissional" (null). With
 * agenda_others, they see every entry in the clinic.
 *
 * The `clinicId` filter is always applied by the caller; this only adds the
 * visibility cut.
 */
export function entryVisibilityWhere(input: {
  canSeeOthers: boolean
  professionalProfileId: string | null
}): Prisma.WaitlistEntryWhereInput {
  const { canSeeOthers, professionalProfileId } = input
  if (canSeeOthers) return {}
  return {
    OR: [
      { professionalProfileId: null },
      ...(professionalProfileId ? [{ professionalProfileId }] : []),
    ],
  }
}
