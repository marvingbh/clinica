import { prisma } from "@/lib/prisma"

export interface ListableProfessional {
  slug: string
  name: string
  specialty: string | null
  bio: string | null
  photoUrl: string | null
}

/**
 * Lists professionals eligible for public booking in a clinic:
 *  - active user
 *  - allowOnlineBooking = true
 *  - has a non-null publicBookingSlug
 *  - has at least one active AvailabilityRule
 */
export async function listBookableProfessionals(clinicId: string): Promise<ListableProfessional[]> {
  const profiles = await prisma.professionalProfile.findMany({
    where: {
      allowOnlineBooking: true,
      publicBookingSlug: { not: null },
      user: { clinicId, isActive: true },
      availabilityRules: { some: { isActive: true } },
    },
    select: {
      publicBookingSlug: true,
      specialty: true,
      bio: true,
      photoUrl: true,
      user: { select: { name: true } },
    },
    orderBy: { user: { name: "asc" } },
  })

  return profiles
    .filter((p) => p.publicBookingSlug)
    .map((p) => ({
      slug: p.publicBookingSlug as string,
      name: p.user.name,
      specialty: p.specialty,
      bio: p.bio,
      photoUrl: p.photoUrl,
    }))
}
