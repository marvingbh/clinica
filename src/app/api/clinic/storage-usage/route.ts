import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { getClinicStorageUsage } from "@/lib/patient-documents"
import { storageLimitBytes, usagePercent } from "@/lib/storage"

/**
 * GET /api/clinic/storage-usage
 * Storage consumption meter for the clinic settings card. `limitBytes` is null
 * when the plan is unlimited; quota falls back to 1024 MB for trial clinics.
 */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (_req: NextRequest, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { plan: { select: { maxStorageMb: true } } },
    })
    const { usedBytes, trashBytes } = await getClinicStorageUsage(prisma, user.clinicId)
    const maxStorageMb = clinic?.plan?.maxStorageMb ?? 1024
    const limitBytes = storageLimitBytes(maxStorageMb)

    return NextResponse.json({
      usedBytes,
      trashBytes,
      limitBytes,
      percent: usagePercent(usedBytes, limitBytes),
    })
  }
)
