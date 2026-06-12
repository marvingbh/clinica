import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"

/** GET — re-download the exact batch file content. */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (_req, { user }, params) => {
    const batch = await prisma.reciboSaudeBatch.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { fileName: true, fileContent: true, professionalProfileId: true },
    })
    if (!batch) return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    if (user.role === "PROFESSIONAL" && batch.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Lote de outro profissional.")
    }
    return NextResponse.json({ fileName: batch.fileName, fileContent: batch.fileContent })
  }
)

/**
 * DELETE — "Desfazer lote". 409 if any emission is already EMITIDO. Removes the
 * batch (emissions cascade), returning the items to the pending list.
 */
export const DELETE = withFeatureAuth(
  { feature: "fiscal", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const batch = await prisma.reciboSaudeBatch.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: {
        id: true,
        professionalProfileId: true,
        emissions: { select: { status: true } },
      },
    })
    if (!batch) return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    if (user.role === "PROFESSIONAL" && batch.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Lote de outro profissional.")
    }
    if (batch.emissions.some((e) => e.status === "EMITIDO")) {
      return NextResponse.json(
        { error: "Lote possui recibos já emitidos — não pode ser desfeito." },
        { status: 409 }
      )
    }

    await prisma.reciboSaudeBatch.delete({ where: { id: batch.id } })

    await audit.log({
      user,
      action: AuditAction.RECIBO_SAUDE_BATCH_UNDONE,
      entityType: "ReciboSaudeBatch",
      entityId: batch.id,
      request: req,
    })

    return NextResponse.json({ success: true })
  }
)
