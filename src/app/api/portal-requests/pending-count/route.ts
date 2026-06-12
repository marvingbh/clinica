import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

/**
 * GET /api/portal-requests/pending-count
 * Pending PortalRequest count for the caller's clinic (badge). WRITE-gated so
 * read-only roles don't poll.
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (_req, { user }) => {
    const count = await prisma.portalRequest.count({
      where: { clinicId: user.clinicId, status: "PENDING" },
    })
    return NextResponse.json({ count }, { headers: { "Cache-Control": "private, max-age=30" } })
  },
)
