import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import {
  canEditDocument,
  canDeleteDocument,
  CATEGORY_VALUES,
} from "@/lib/patient-documents"

const patchSchema = z.object({
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]).optional(),
  description: z.string().max(500).nullable().optional(),
  sharedWithPatient: z.boolean().optional(),
})

async function loadDoc(clinicId: string, patientId: string, docId: string) {
  return prisma.patientDocument.findFirst({
    where: { id: docId, patientId, clinicId },
    select: {
      id: true,
      source: true,
      category: true,
      description: true,
      sharedWithPatient: true,
      deletedAt: true,
    },
  })
}

/** PATCH /api/patients/[id]/documents/[docId] — edit metadata (UPLOAD only). */
export const PATCH = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const doc = await loadDoc(user.clinicId, params.id, params.docId)
    if (!doc) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }
    if (!canEditDocument({ source: doc.source, category: doc.category, deletedAt: doc.deletedAt })) {
      return NextResponse.json(
        { error: "Documento gerado pelo sistema — não editável" },
        { status: 403 }
      )
    }

    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }
    const data = parsed.data

    const oldValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}
    for (const key of ["category", "description", "sharedWithPatient"] as const) {
      if (data[key] !== undefined && data[key] !== doc[key]) {
        oldValues[key] = doc[key]
        newValues[key] = data[key]
      }
    }

    const updated = await prisma.patientDocument.update({
      where: { id: doc.id },
      data: {
        ...(data.category !== undefined ? { category: data.category as never } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.sharedWithPatient !== undefined
          ? { sharedWithPatient: data.sharedWithPatient }
          : {}),
      },
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

    if (Object.keys(newValues).length > 0) {
      await audit.log({
        user,
        action: AuditAction.DOCUMENT_UPDATED,
        entityType: "PatientDocument",
        entityId: doc.id,
        oldValues,
        newValues,
        request: req,
      })
    }

    return NextResponse.json({ document: updated })
  }
)

/** DELETE /api/patients/[id]/documents/[docId] — soft delete (UPLOAD only). */
export const DELETE = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const doc = await loadDoc(user.clinicId, params.id, params.docId)
    if (!doc) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }
    if (!canDeleteDocument({ source: doc.source, category: doc.category, deletedAt: doc.deletedAt })) {
      return NextResponse.json(
        { error: "Documento vinculado ao prontuário — sujeito à retenção clínica" },
        { status: 403 }
      )
    }

    await prisma.patientDocument.update({
      where: { id: doc.id },
      data: { deletedAt: new Date() },
    })

    await audit.log({
      user,
      action: AuditAction.DOCUMENT_DELETED,
      entityType: "PatientDocument",
      entityId: doc.id,
      request: req,
    })

    return NextResponse.json({ ok: true })
  }
)
