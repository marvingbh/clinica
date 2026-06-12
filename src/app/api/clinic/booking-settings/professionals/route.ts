import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

/**
 * GET /api/clinic/booking-settings/professionals
 *
 * Lists the clinic's professionals with their public-booking fields for the
 * ADMIN settings table. Read-only; scoped to the caller's clinic.
 */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (_req, { user }) => {
    const users = await prisma.user.findMany({
      where: { clinicId: user.clinicId, professionalProfile: { isNot: null }, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        professionalProfile: {
          select: {
            id: true,
            allowOnlineBooking: true,
            publicBookingSlug: true,
            appointmentDuration: true,
            bufferBetweenSlots: true,
            availabilityRules: { where: { isActive: true }, select: { id: true }, take: 1 },
          },
        },
      },
    })

    const professionals = users.map((u) => ({
      id: u.id,
      name: u.name,
      professionalProfileId: u.professionalProfile?.id ?? null,
      allowOnlineBooking: u.professionalProfile?.allowOnlineBooking ?? false,
      publicBookingSlug: u.professionalProfile?.publicBookingSlug ?? null,
      hasAvailability: (u.professionalProfile?.availabilityRules.length ?? 0) > 0,
      appointmentDuration: u.professionalProfile?.appointmentDuration ?? null,
      bufferBetweenSlots: u.professionalProfile?.bufferBetweenSlots ?? null,
    }))

    return NextResponse.json({ professionals })
  }
)
