import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { canCancelEnvelope } from "@/lib/assinaturas"
import { canAccessPatientSignatures } from "../../_lib/scope"

const NON_FINAL = ["PENDENTE", "VISUALIZADO"] as const

export const POST = withFeatureAuth(
  { feature: "assinaturas", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }, params) => {
    const envelope = await prisma.signatureEnvelope.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, patientId: true, status: true },
    })
    if (!envelope) return NextResponse.json({ error: "Envelope não encontrado" }, { status: 404 })
    if (!(await canAccessPatientSignatures(user, envelope.patientId))) {
      return NextResponse.json({ error: "Envelope não encontrado" }, { status: 404 })
    }
    if (!canCancelEnvelope(envelope.status as never)) {
      return NextResponse.json({ error: "Este envio não pode ser cancelado." }, { status: 422 })
    }

    await prisma.$transaction([
      prisma.signatureEnvelope.update({ where: { id: envelope.id }, data: { status: "CANCELADO" } }),
      prisma.signatureRequest.updateMany({
        where: { envelopeId: envelope.id, status: { in: [...NON_FINAL] } },
        data: { status: "CANCELADO" },
      }),
    ])

    await audit.log({
      user,
      action: AuditAction.SIGNATURE_REQUEST_CANCELLED,
      entityType: "SignatureEnvelope",
      entityId: envelope.id,
      request: req,
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  }
)
