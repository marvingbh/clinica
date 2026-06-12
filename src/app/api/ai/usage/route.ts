import { NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { loadAiContext, resolveCredits } from "../_helpers"

/**
 * GET /api/ai/usage — current month's AI credits for the calling user/clinic.
 * The UI uses this to decide whether to show the "Gerar com IA" panel; the
 * server revalidates everything again on POST (RN5).
 */
export const GET = withFeatureAuth(
  { feature: "ai_assist", minAccess: "READ" },
  async (_req, { user }) => {
    const { clinic, user: dbUser } = await loadAiContext(user.clinicId, user.id)
    const planCredits = clinic?.plan?.aiMonthlyCredits ?? 0
    const { used, result } = await resolveCredits(user.clinicId, planCredits)

    const enabled = Boolean(clinic?.aiEnabled) && planCredits !== 0
    const limit = planCredits < 0 ? null : planCredits

    return NextResponse.json(
      {
        enabled,
        optedOut: dbUser?.aiOptOut ?? false,
        used,
        limit,
        remaining: result.remaining,
      },
      { headers: { "Cache-Control": "private, max-age=30" } }
    )
  }
)
