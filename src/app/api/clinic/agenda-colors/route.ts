import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { resolveAgendaColors } from "@/lib/clinic/colors/schema"

/**
 * GET /api/clinic/agenda-colors
 *
 * Read-only endpoint for the agenda's color preferences. PROFESSIONAL users
 * need this to render their agenda but don't have `clinic_settings:READ`, so
 * gating is on `agenda_own:READ` — which every authenticated clinic user has.
 *
 * The response is always a fully-merged `AgendaColors` object (defaults
 * applied), so callers never see `null` / partial / unknown shapes.
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (_req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { agendaColors: true },
    })
    return NextResponse.json({
      agendaColors: resolveAgendaColors(clinic?.agendaColors),
    })
  },
)
