/**
 * registerSystemDocument — the frozen contract for plans 008/009/010 to archive
 * generated PDFs (CFP documents, signed TCLEs, form exports) in a patient's
 * document library. Called *inside* the originating feature's transaction.
 *
 * System documents: `uploaderUserId = null` (shown as "Sistema"), immutable
 * metadata, not user-removable, and they bypass the upload quota (they are
 * mandatory clinical artifacts) — though they still count toward displayed usage.
 */

import type { PatientDocumentSourceString } from "./types"

/** Minimal Prisma surface needed here (real client or a transaction client). */
export interface PatientDocumentCreateDb {
  patientDocument: {
    create(args: {
      data: Record<string, unknown>
      select?: Record<string, unknown>
    }): Promise<{ id: string }>
  }
}

export interface RegisterSystemDocumentInput {
  clinicId: string
  patientId: string
  source: Exclude<PatientDocumentSourceString, "UPLOAD">
  filename: string
  mimeType: string
  sizeBytes: number
  storageKey: string
  category?: string
  description?: string | null
  sharedWithPatient?: boolean
}

/**
 * Persist a system-generated document row. Throws if `source` is "UPLOAD"
 * (manual uploads must go through the upload/register routes with quota).
 */
export async function registerSystemDocument(
  db: PatientDocumentCreateDb,
  input: RegisterSystemDocumentInput
): Promise<{ id: string }> {
  // Runtime guard: this entry point is for system artifacts only.
  if ((input.source as string) === "UPLOAD") {
    throw new Error(
      "registerSystemDocument não aceita source UPLOAD; use a rota de upload."
    )
  }

  return db.patientDocument.create({
    data: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      uploaderUserId: null,
      source: input.source,
      category: input.category ?? "DOCUMENTO",
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
      description: input.description ?? null,
      sharedWithPatient: input.sharedWithPatient ?? false,
    },
    select: { id: true },
  })
}
