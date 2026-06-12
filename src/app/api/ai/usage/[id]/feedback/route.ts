import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { feedbackSchema } from "../../../_helpers"

/**
 * POST /api/ai/usage/[id]/feedback — 👍/👎 on a generation. Only the author
 * (userId) within the clinic may rate it (RN14); a 0-row update is a 404.
 */
export const POST = withFeatureAuth(
  { feature: "ai_assist", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const parsed = feedbackSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const updated = await prisma.aiUsage.updateMany({
      where: { id: params.id, clinicId: user.clinicId, userId: user.id },
      data: { feedback: parsed.data.feedback },
    })

    if (updated.count === 0) {
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  }
)
