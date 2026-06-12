import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import type { BookingRequestStatus, Prisma } from "@prisma/client"

const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const

/**
 * GET /api/booking-requests?status=PENDING
 *
 * Lists booking requests for the caller's clinic. PROFESSIONAL users without
 * agenda_others READ only see requests on their own slots.
 */
export const GET = withFeatureAuth(
  { feature: "online_booking", minAccess: "READ" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const statusParam = url.searchParams.get("status")
    const status = VALID_STATUSES.includes(statusParam as BookingRequestStatus)
      ? (statusParam as BookingRequestStatus)
      : "PENDING"

    const where: Prisma.BookingRequestWhereInput = { clinicId: user.clinicId, status }

    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    if (!canSeeOthers) {
      if (!user.professionalProfileId) {
        return NextResponse.json({ requests: [] })
      }
      where.professionalProfileId = user.professionalProfileId
    }

    const requests = await prisma.bookingRequest.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        endAt: true,
        modality: true,
        name: true,
        phone: true,
        email: true,
        cpf: true,
        patientId: true,
        rejectionReason: true,
        createdAt: true,
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        patient: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ requests })
  }
)
