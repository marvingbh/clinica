import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"

/**
 * GET /api/calendar-sync/busy-blocks?professionalProfileId=&from=&to=
 * Phase 2. Returns the busy intervals (no title/source) for a professional in
 * the requested window. Viewing another professional requires agenda_others ≥
 * READ (mirrors the agenda routes). Always clinic-scoped.
 */
export const GET = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const requested = searchParams.get("professionalProfileId")
    const fromStr = searchParams.get("from")
    const toStr = searchParams.get("to")

    const professionalProfileId = requested || user.professionalProfileId
    if (!professionalProfileId) {
      return NextResponse.json({ busy: [] })
    }

    if (
      professionalProfileId !== user.professionalProfileId &&
      !meetsMinAccess(user.permissions.agenda_others, "READ")
    ) {
      return forbiddenResponse("Sem permissão para ver a agenda de outros profissionais")
    }

    const now = new Date()
    const from = fromStr ? new Date(fromStr) : now
    const to = toStr ? new Date(toStr) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const blocks = await prisma.busyBlock.findMany({
      where: {
        clinicId: user.clinicId,
        professionalProfileId,
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: "asc" },
    })

    return NextResponse.json({
      busy: blocks.map((b) => ({ start: b.startAt.toISOString(), end: b.endAt.toISOString() })),
    })
  }
)
