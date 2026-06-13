import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import {
  visibleCategoriesFor,
  CATEGORY_VALUES,
} from "@/lib/patient-documents"
import {
  buildStorageKey,
  validateUpload,
  getMaxFileSizeBytes,
  checkStorageQuota,
} from "@/lib/storage"
import { getStorageProvider } from "@/lib/storage/server"
import { ensurePatient, loadStorageContext, mapDocumentError } from "./_helpers"

const DOC_SELECT = {
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
} as const

/** GET /api/patients/[id]/documents — list a patient's documents (clinic-scoped). */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    try {
      await ensurePatient(user.clinicId, params.id)
      const { settings } = await loadStorageContext(user.clinicId)
      const url = new URL(req.url)
      const includeDeleted = url.searchParams.get("includeDeleted") === "true"
      const categoryParam = url.searchParams.get("category")
      const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0)
      const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take")) || 20))

      const visible = visibleCategoriesFor(
        { professionalProfileId: user.professionalProfileId },
        settings
      )
      const categoryFilter =
        categoryParam && CATEGORY_VALUES.includes(categoryParam as never)
          ? visible.filter((c) => c === categoryParam)
          : visible

      const where = {
        clinicId: user.clinicId,
        patientId: params.id,
        // Active view: only non-deleted. Trash view: ONLY the soft-deleted ones
        // (the toggle "Mostrar lixeira" lists removed documents — Fluxo E.3).
        deletedAt: includeDeleted ? { not: null } : null,
        category: { in: categoryFilter },
      }

      const [documents, total] = await Promise.all([
        prisma.patientDocument.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: DOC_SELECT,
        }),
        prisma.patientDocument.count({ where }),
      ])

      return NextResponse.json({ documents, total })
    } catch (e) {
      const mapped = mapDocumentError(e)
      if (mapped) return mapped
      throw e
    }
  }
)

/**
 * POST /api/patients/[id]/documents — multipart upload (dev/fs provider and
 * small files). Validates type/size/quota, stores the blob, creates the row.
 */
export const POST = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    try {
      await ensurePatient(user.clinicId, params.id)

      const form = await req.formData()
      const file = form.get("file")
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 })
      }
      const category = String(form.get("category") || "DOCUMENTO")
      if (!CATEGORY_VALUES.includes(category as never)) {
        return NextResponse.json({ error: "Categoria inválida." }, { status: 400 })
      }
      const description = form.get("description")
        ? String(form.get("description")).slice(0, 500)
        : null
      const sharedWithPatient = form.get("sharedWithPatient") === "true"

      const sizeBytes = file.size
      const mimeType = file.type
      const filename = file.name

      const validation = validateUpload({
        filename,
        mimeType,
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
          {
            error: quota.message,
            code: "STORAGE_QUOTA_EXCEEDED",
            usedBytes: ctx.usedBytes,
          },
          { status: 403 }
        )
      }

      const documentId = randomUUID()
      const storageKey = buildStorageKey({
        clinicId: user.clinicId,
        patientId: params.id,
        documentId,
        filename,
      })
      const buffer = Buffer.from(await file.arrayBuffer())
      await getStorageProvider().put(storageKey, buffer, { mimeType })

      const doc = await prisma.patientDocument.create({
        data: {
          id: documentId,
          clinicId: user.clinicId,
          patientId: params.id,
          uploaderUserId: user.id,
          source: "UPLOAD",
          category: category as never,
          filename,
          mimeType,
          sizeBytes,
          storageKey,
          description,
          sharedWithPatient,
        },
        select: DOC_SELECT,
      })

      await audit.log({
        user,
        action: AuditAction.DOCUMENT_UPLOADED,
        entityType: "PatientDocument",
        entityId: doc.id,
        newValues: { filename, category, sizeBytes },
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
