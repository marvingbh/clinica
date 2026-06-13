/**
 * Pure lifecycle rules: trash retention purge eligibility and orphan-blob
 * detection for the weekly cleanup cron (Fluxo F).
 */

import type { StoredObject } from "@/lib/storage"

export const TRASH_RETENTION_DAYS = 30
export const ORPHAN_GRACE_HOURS = 24

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * True when a soft-deleted document is past its retention window and should be
 * purged (blob + row). Active documents (deletedAt null) are never eligible.
 */
export function isPurgeEligible(
  deletedAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!deletedAt) return false
  return now.getTime() - deletedAt.getTime() >= TRASH_RETENTION_DAYS * DAY_MS
}

/** Date a soft-deleted document will be permanently purged. */
export function purgeDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS)
}

/**
 * Keys for blobs that have no corresponding `PatientDocument` row and were
 * uploaded more than {@link ORPHAN_GRACE_HOURS} ago (a half-finished upload).
 * The grace window avoids deleting in-flight uploads.
 */
export function findOrphanKeys(
  blobs: StoredObject[],
  knownKeys: Set<string>,
  now: Date = new Date()
): string[] {
  const cutoff = now.getTime() - ORPHAN_GRACE_HOURS * HOUR_MS
  return blobs
    .filter(
      (b) => !knownKeys.has(b.key) && b.uploadedAt.getTime() < cutoff
    )
    .map((b) => b.key)
}
