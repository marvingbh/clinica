import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"

/**
 * POST /api/forms/responses/[id]/cancel — revokes a pending send (status →
 * EXPIRADO). 409 if already CONCLUIDO.
 */
export const POST = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const response = await prisma.formResponse.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, status: true },
    })
    if (!response) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
    if (response.status === "CONCLUIDO") {
      return NextResponse.json({ error: "Formulário já enviado" }, { status: 409 })
    }

    const updated = await prisma.formResponse.update({
      where: { id: response.id },
      data: { status: "EXPIRADO" },
    })

    await audit.log({
      user,
      action: AuditAction.FORM_CANCELLED,
      entityType: "FormResponse",
      entityId: response.id,
      request: req,
    })

    return NextResponse.json({ response: { id: updated.id, status: updated.status } })
  }
)
