import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { computeWaitlistMetrics, entryVisibilityWhere } from "@/lib/waitlist"

/** GET /api/waitlist/metrics — aggregate metrics (clinic-scoped + visibility cut). */
export const GET = withFeatureAuth(
  { feature: "waitlist", minAccess: "READ" },
  async (_req, { user }) => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const visibility = entryVisibilityWhere({
      canSeeOthers,
      professionalProfileId: user.professionalProfileId,
    })

    // Offer visibility mirrors entry visibility via the offer's professional.
    const offerProfessionalFilter = canSeeOthers
      ? {}
      : {
          professionalProfileId: user.professionalProfileId ?? "__none__",
        }

    const [activeEntries, offers, conversions] = await Promise.all([
      prisma.waitlistEntry.findMany({
        where: { clinicId: user.clinicId, status: "ATIVA", ...visibility },
        select: { createdAt: true },
      }),
      prisma.waitlistOffer.findMany({
        where: {
          clinicId: user.clinicId,
          createdAt: { gte: thirtyDaysAgo },
          ...offerProfessionalFilter,
        },
        select: { status: true, createdAt: true },
      }),
      prisma.waitlistEntry.findMany({
        where: {
          clinicId: user.clinicId,
          status: "CONVERTIDA",
          ...visibility,
        },
        select: { patient: { select: { sessionFee: true } } },
      }),
    ])

    const metrics = computeWaitlistMetrics({
      activeEntries,
      offers,
      conversions: conversions.map((c) => ({
        sessionFee: c.patient?.sessionFee ? Number(c.patient.sessionFee) : null,
      })),
      now,
    })

    return NextResponse.json({ metrics })
  }
)
