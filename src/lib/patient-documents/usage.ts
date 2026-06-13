/**
 * Clinic storage usage aggregation. `usedBytes` includes documents in the trash
 * (the blob still occupies space until purged); `trashBytes` is the subset
 * currently soft-deleted, surfaced separately in the consumption meter.
 */

export interface PatientDocumentAggregateDb {
  patientDocument: {
    aggregate(args: {
      where: Record<string, unknown>
      _sum: { sizeBytes: true }
    }): Promise<{ _sum: { sizeBytes: number | null } }>
  }
}

export interface ClinicStorageUsage {
  usedBytes: number
  trashBytes: number
}

/**
 * Total bytes used by a clinic (active + trashed) and the trashed subset.
 */
export async function getClinicStorageUsage(
  db: PatientDocumentAggregateDb,
  clinicId: string
): Promise<ClinicStorageUsage> {
  const [all, trash] = await Promise.all([
    db.patientDocument.aggregate({
      where: { clinicId },
      _sum: { sizeBytes: true },
    }),
    db.patientDocument.aggregate({
      where: { clinicId, deletedAt: { not: null } },
      _sum: { sizeBytes: true },
    }),
  ])
  return {
    usedBytes: all._sum.sizeBytes ?? 0,
    trashBytes: trash._sum.sizeBytes ?? 0,
  }
}
