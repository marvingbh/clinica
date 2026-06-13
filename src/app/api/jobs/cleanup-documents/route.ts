import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import {
  isPurgeEligible,
  findOrphanKeys,
  TRASH_RETENTION_DAYS,
} from "@/lib/patient-documents"
import { clinicPrefix } from "@/lib/storage"
import { getStorageProvider } from "@/lib/storage/server"

/**
 * GET /api/jobs/cleanup-documents
 * Weekly cron (Mondays 04:00 UTC). Per clinic:
 *   a. Purge trashed documents older than the retention window (blob + row).
 *   b. Collect orphan blobs (no row, older than the grace window).
 * Guarded by Bearer CRON_SECRET (same as the other jobs). Errors in one clinic
 * never abort the others.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const provider = getStorageProvider()
  const processed = { clinics: 0, purged: 0, orphansDeleted: 0 }
  const errors: string[] = []

  // Clinics that have at least one document row.
  const clinicGroups = await prisma.patientDocument.groupBy({
    by: ["clinicId"],
  })

  for (const { clinicId } of clinicGroups) {
    processed.clinics++
    try {
      // (a) Purge eligible trashed documents.
      const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      const trashed = await prisma.patientDocument.findMany({
        where: { clinicId, deletedAt: { not: null, lte: cutoff } },
        select: { id: true, storageKey: true, deletedAt: true },
      })
      const purgedIds: string[] = []
      for (const doc of trashed) {
        if (!isPurgeEligible(doc.deletedAt, now)) continue
        // Delete the blob FIRST (idempotent) so a crash between steps can retry.
        await provider.delete(doc.storageKey)
        await prisma.patientDocument.delete({ where: { id: doc.id } })
        purgedIds.push(doc.id)
      }
      processed.purged += purgedIds.length
      if (purgedIds.length > 0) {
        await logSystemAudit({
          clinicId,
          action: AuditAction.DOCUMENTS_PURGED,
          entityType: "PatientDocument",
          entityId: clinicId,
          newValues: { count: purgedIds.length, ids: purgedIds },
        })
      }

      // (b) Collect orphan blobs (uploaded but never registered).
      const blobs = await provider.list(clinicPrefix(clinicId))
      const knownKeys = new Set(
        (
          await prisma.patientDocument.findMany({
            where: { clinicId },
            select: { storageKey: true },
          })
        ).map((d) => d.storageKey)
      )
      const orphans = findOrphanKeys(blobs, knownKeys, now)
      for (const key of orphans) {
        await provider.delete(key)
      }
      processed.orphansDeleted += orphans.length
    } catch (e) {
      errors.push(`${clinicId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ processed, errors })
}
