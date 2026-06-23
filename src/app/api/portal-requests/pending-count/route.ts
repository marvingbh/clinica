import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

/**
 * Audience scope (mirrors the list route): ADMIN / profile-less users see every
 * pending request; a PROFESSIONAL only sees requests for patients they reference
 * or have appointments with — so the banner reaches "admin or the related
 * professional", not unrelated professionals.
 */
function scopeWhere(role: string, professionalProfileId: string | null): Prisma.PortalRequestWhereInput {
  if (role === "ADMIN" || !professionalProfileId) return {}
  return {
    patient: {
      OR: [
        { referenceProfessionalId: professionalProfileId },
        { appointments: { some: { professionalProfileId } } },
      ],
    },
  }
}

/**
 * GET /api/portal-requests/pending-count
 * Pending PortalRequest count for the caller (clinic + audience-scoped). READ-gated
 * so any reviewer/professional polls it for the notification banner.
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (_req, { user }) => {
    const count = await prisma.portalRequest.count({
      where: {
        clinicId: user.clinicId,
        status: "PENDING",
        ...scopeWhere(user.role, user.professionalProfileId),
      },
    })
    return NextResponse.json({ count }, { headers: { "Cache-Control": "private, max-age=30" } })
  },
)
