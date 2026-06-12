import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import type { Prisma } from "@prisma/client"

/**
 * GET /api/booking-requests/pending-count
 *
 * Returns the number of PENDING booking requests for the caller's clinic.
 * Powers the nav badge. Mirrors intake-submissions/pending-count.
 *
 * PROFESSIONAL users without agenda_others READ only count their own.
 */
export const GET = withFeatureAuth(
  { feature: "online_booking", minAccess: "WRITE" },
  async (_req, { user }) => {
    const where: Prisma.BookingRequestWhereInput = {
      clinicId: user.clinicId,
      status: "PENDING",
    }

    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    if (!canSeeOthers) {
      if (!user.professionalProfileId) {
        return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "private, max-age=30" } })
      }
      where.professionalProfileId = user.professionalProfileId
    }

    const count = await prisma.bookingRequest.count({ where })
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "private, max-age=30" } }
    )
  }
)
