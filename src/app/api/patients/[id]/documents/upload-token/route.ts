import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import {
  ALLOWED_MIME_TYPES,
  getMaxFileSizeBytes,
  checkStorageQuota,
  patientPrefix,
  isClientUploadProvider,
} from "@/lib/storage"
import { ensurePatient, loadStorageContext, mapDocumentError } from "../_helpers"

/**
 * POST /api/patients/[id]/documents/upload-token
 * Vercel Blob client-upload protocol (production path; bypasses the 4.5 MB
 * function body limit). Validates quota + restricts the token to the clinic
 * patient prefix and the allowed content types. Does NOT create the DB row —
 * that is the /register route's job. Returns 400 when the active provider is
 * not vercel-blob (use /upload instead).
 */
export const POST = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    if (!isClientUploadProvider()) {
      return NextResponse.json(
        {
          error:
            "Provider de armazenamento não suporta upload direto. Use a rota de upload multipart.",
        },
        { status: 400 }
      )
    }

    try {
      await ensurePatient(user.clinicId, params.id)
      const ctx = await loadStorageContext(user.clinicId)
      const maxSizeBytes = getMaxFileSizeBytes(process.env.DOCUMENT_MAX_SIZE_MB)
      const prefix = patientPrefix(user.clinicId, params.id)

      const { handleUpload } = await import("@vercel/blob/client")
      const body = await req.json()

      const jsonResponse = await handleUpload({
        request: req,
        body,
        onBeforeGenerateToken: async (pathname: string) => {
          // Token is scoped to this clinic/patient prefix and the allowlist.
          if (!pathname.startsWith(prefix)) {
            throw new Error("Caminho de upload inválido para este paciente.")
          }
          const quota = checkStorageQuota({
            maxStorageMb: ctx.maxStorageMb,
            usedBytes: ctx.usedBytes,
            incomingBytes: 0,
          })
          if (!quota.allowed) {
            throw new Error(quota.message ?? "Limite de armazenamento atingido.")
          }
          return {
            allowedContentTypes: [...ALLOWED_MIME_TYPES.keys()],
            maximumSizeInBytes: maxSizeBytes,
            addRandomSuffix: true,
          }
        },
        // onUploadCompleted is unreliable on localhost; the /register route
        // (called by the client after upload) creates the DB row instead.
        onUploadCompleted: async () => {},
      })

      return NextResponse.json(jsonResponse)
    } catch (e) {
      const mapped = mapDocumentError(e)
      if (mapped) return mapped
      const message = e instanceof Error ? e.message : "Falha ao gerar token de upload."
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }
)
