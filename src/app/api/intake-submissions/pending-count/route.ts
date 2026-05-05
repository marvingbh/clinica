import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

/**
 * GET /api/intake-submissions/pending-count
 *
 * Returns the number of pending IntakeSubmissions for the caller's clinic.
 * Powers the persistent banner + nav badge that surface intake submissions
 * waiting for review.
 *
 * minAccess: WRITE — only users who can act on submissions need the count;
 * read-only roles see no banner / no badge and don't trigger the fetch.
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (_req, { user }) => {
    const count = await prisma.intakeSubmission.count({
      where: { clinicId: user.clinicId, status: "PENDING" },
    })
    return NextResponse.json(
      { count },
      {
        headers: {
          // Soak in-flight tab refreshes without re-hitting Prisma; the 60s
          // poll interval still drives freshness.
          "Cache-Control": "private, max-age=30",
        },
      },
    )
  },
)
