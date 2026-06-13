import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { isPurgeEligible } from "@/lib/patient-documents"

/**
 * POST /api/patients/[id]/documents/[docId]/restore
 * Restore a soft-deleted document from the trash (clears deletedAt). Refuses if
 * the document is not in the trash or has already passed the purge window.
 */
export const POST = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const doc = await prisma.patientDocument.findFirst({
      where: { id: params.docId, patientId: params.id, clinicId: user.clinicId },
      select: { id: true, deletedAt: true },
    })
    if (!doc) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }
    if (!doc.deletedAt) {
      return NextResponse.json(
        { error: "Documento não está na lixeira" },
        { status: 400 }
      )
    }
    if (isPurgeEligible(doc.deletedAt, new Date())) {
      return NextResponse.json(
        { error: "Documento já passou da janela de restauração" },
        { status: 410 }
      )
    }

    const restored = await prisma.patientDocument.update({
      where: { id: doc.id },
      data: { deletedAt: null },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        category: true,
        source: true,
        description: true,
        sharedWithPatient: true,
        deletedAt: true,
        createdAt: true,
        uploader: { select: { name: true } },
      },
    })

    await audit.log({
      user,
      action: AuditAction.DOCUMENT_RESTORED,
      entityType: "PatientDocument",
      entityId: doc.id,
      request: req,
    })

    return NextResponse.json({ document: restored })
  }
)
