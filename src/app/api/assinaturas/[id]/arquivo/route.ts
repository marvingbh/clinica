import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { canAccessPatientSignatures } from "../../_lib/scope"

export const GET = withFeatureAuth(
  { feature: "assinaturas", minAccess: "READ" },
  async (req: NextRequest, { user }: { user: AuthUser }, params) => {
    const envelope = await prisma.signatureEnvelope.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: {
        id: true, patientId: true, status: true, signedPdf: true,
        document: { select: { title: true } },
      },
    })
    if (!envelope || envelope.status !== "CONCLUIDO" || !envelope.signedPdf) {
      return NextResponse.json({ error: "Documento assinado não encontrado" }, { status: 404 })
    }
    if (!(await canAccessPatientSignatures(user, envelope.patientId))) {
      return NextResponse.json({ error: "Documento assinado não encontrado" }, { status: 404 })
    }

    await audit.log({
      user,
      action: AuditAction.SIGNATURE_FILE_DOWNLOADED,
      entityType: "SignatureEnvelope",
      entityId: envelope.id,
      request: req,
    }).catch(() => {})

    const bytes = Buffer.from(envelope.signedPdf)
    const safe = envelope.document.title.replace(/[^\w\-. ]/g, "_").slice(0, 80) || "documento"
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe}-assinado.pdf"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    })
  }
)
