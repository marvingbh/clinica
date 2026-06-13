import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { canViewDocument } from "@/lib/patient-documents"
import { getStorageProvider } from "@/lib/storage"
import { loadStorageContext } from "../../_helpers"

/**
 * GET /api/patients/[id]/documents/[docId]/download
 * Authenticated proxy of the blob (the provider URL is never exposed).
 * `?disposition=inline|attachment` (default attachment). Audits every access.
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const doc = await prisma.patientDocument.findFirst({
      where: { id: params.docId, patientId: params.id, clinicId: user.clinicId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        category: true,
        source: true,
        storageKey: true,
        deletedAt: true,
      },
    })
    if (!doc) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }

    const { settings } = await loadStorageContext(user.clinicId)
    if (
      !canViewDocument(
        { professionalProfileId: user.professionalProfileId },
        { source: doc.source, category: doc.category, deletedAt: doc.deletedAt },
        settings
      )
    ) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    if (doc.deletedAt) {
      return NextResponse.json({ error: "Documento removido" }, { status: 410 })
    }

    const disposition =
      new URL(req.url).searchParams.get("disposition") === "inline"
        ? "inline"
        : "attachment"

    await audit.log({
      user,
      action: AuditAction.DOCUMENT_DOWNLOADED,
      entityType: "PatientDocument",
      entityId: doc.id,
      newValues: { filename: doc.filename, disposition },
      request: req,
    })

    let stream
    try {
      stream = await getStorageProvider().getDownloadStream(doc.storageKey)
    } catch {
      return NextResponse.json(
        { error: "Não foi possível recuperar o arquivo. Tente novamente." },
        { status: 502 }
      )
    }
    if (!stream) {
      return NextResponse.json(
        { error: "Não foi possível recuperar o arquivo. Tente novamente." },
        { status: 502 }
      )
    }

    const encoded = encodeURIComponent(doc.filename)
    return new NextResponse(stream.body, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(stream.sizeBytes),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
      },
    })
  }
)
