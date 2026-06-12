import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"

/**
 * POST — mark an emission CANCELADO. The actual cancellation happens manually in
 * the RFB app (e.g. after a refund); this records the local state.
 */
export const POST = withFeatureAuth(
  { feature: "fiscal", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const emission = await prisma.reciboSaudeEmission.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, professionalProfileId: true },
    })
    if (!emission) return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    if (user.role === "PROFESSIONAL" && emission.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Recibo de outro profissional.")
    }

    await prisma.reciboSaudeEmission.update({
      where: { id: emission.id },
      data: { status: "CANCELADO", canceladoAt: new Date() },
    })

    await audit.log({
      user,
      action: AuditAction.RECIBO_SAUDE_CANCELLED,
      entityType: "ReciboSaudeEmission",
      entityId: emission.id,
      request: req,
    })

    return NextResponse.json({ success: true })
  }
)
