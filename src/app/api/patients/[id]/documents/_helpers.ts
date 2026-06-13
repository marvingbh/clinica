import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OwnershipError, assertPatientInClinic } from "@/lib/clinic/ownership"
import {
  getClinicStorageUsage,
  type DocumentSettings,
} from "@/lib/patient-documents"

/**
 * Maps domain errors to HTTP responses for the patient-document routes.
 * Returns null when the error is not a known domain error (rethrow).
 */
export function mapDocumentError(e: unknown): NextResponse | null {
  if (e instanceof OwnershipError) {
    return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
  }
  return null
}

/** Throws OwnershipError (→ 404) if the patient is not in the clinic. */
export async function ensurePatient(
  clinicId: string,
  patientId: string
): Promise<void> {
  await assertPatientInClinic(clinicId, patientId)
}

export interface ClinicStorageContext {
  settings: DocumentSettings
  maxStorageMb: number | null
  usedBytes: number
  trashBytes: number
}

/**
 * Loads the clinic's storage settings + plan quota + current usage. The quota
 * falls back to the product default (1024 MB) when the clinic has no plan
 * (trial). `null` quota means unlimited.
 */
export async function loadStorageContext(
  clinicId: string
): Promise<ClinicStorageContext> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      restrictExamesToProfessionals: true,
      plan: { select: { maxStorageMb: true } },
    },
  })
  const usage = await getClinicStorageUsage(prisma, clinicId)
  const maxStorageMb = clinic?.plan?.maxStorageMb ?? 1024
  return {
    settings: {
      restrictExamesToProfessionals:
        clinic?.restrictExamesToProfessionals ?? false,
    },
    maxStorageMb: maxStorageMb === -1 ? -1 : maxStorageMb,
    usedBytes: usage.usedBytes,
    trashBytes: usage.trashBytes,
  }
}
