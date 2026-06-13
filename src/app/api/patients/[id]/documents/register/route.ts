import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { CATEGORY_VALUES } from "@/lib/patient-documents"
import {
  getStorageProvider,
  keyBelongsTo,
  validateUpload,
  getMaxFileSizeBytes,
  checkStorageQuota,
} from "@/lib/storage"
import { ensurePatient, loadStorageContext, mapDocumentError } from "../_helpers"

const registerSchema = z.object({
  storageKey: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]).default("DOCUMENTO"),
  description: z.string().max(500).nullable().optional(),
  sharedWithPatient: z.boolean().optional(),
})

/**
 * POST /api/patients/[id]/documents/register
 * Registers a blob uploaded via the Vercel Blob client-upload flow. The size is
 * taken from the provider (never trusted from the body). Anti cross-tenant:
 * the key must belong to this clinic/patient prefix.
 */
export const POST = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    try {
      await ensurePatient(user.clinicId, params.id)

      const parsed = registerSchema.safeParse(await req.json())
      if (!parsed.success) {
        return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
      }
      const input = parsed.data

      if (!keyBelongsTo(input.storageKey, user.clinicId, params.id)) {
        return NextResponse.json({ error: "Chave de armazenamento inválida" }, { status: 403 })
      }

      const meta = await getStorageProvider().head(input.storageKey)
      if (!meta) {
        return NextResponse.json(
          { error: "Arquivo enviado não encontrado" },
          { status: 404 }
        )
      }
      const sizeBytes = meta.sizeBytes

      const validation = validateUpload({
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes,
        maxSizeBytes: getMaxFileSizeBytes(process.env.DOCUMENT_MAX_SIZE_MB),
      })
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      const ctx = await loadStorageContext(user.clinicId)
      const quota = checkStorageQuota({
        maxStorageMb: ctx.maxStorageMb,
        usedBytes: ctx.usedBytes,
        incomingBytes: sizeBytes,
      })
      if (!quota.allowed) {
        return NextResponse.json(
          { error: quota.message, code: "STORAGE_QUOTA_EXCEEDED", usedBytes: ctx.usedBytes },
          { status: 403 }
        )
      }

      const existing = await prisma.patientDocument.findUnique({
        where: { storageKey: input.storageKey },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json({ error: "Documento já registrado" }, { status: 409 })
      }

      const doc = await prisma.patientDocument.create({
        data: {
          clinicId: user.clinicId,
          patientId: params.id,
          uploaderUserId: user.id,
          source: "UPLOAD",
          category: input.category as never,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes,
          storageKey: input.storageKey,
          description: input.description ?? null,
          sharedWithPatient: input.sharedWithPatient ?? false,
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

      await audit.log({
        user,
        action: AuditAction.DOCUMENT_UPLOADED,
        entityType: "PatientDocument",
        entityId: doc.id,
        newValues: { filename: input.filename, category: input.category, sizeBytes },
        request: req,
      })

      return NextResponse.json({ document: doc }, { status: 201 })
    } catch (e) {
      const mapped = mapDocumentError(e)
      if (mapped) return mapped
      throw e
    }
  }
)
