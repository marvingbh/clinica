import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { assertPatientInClinic, OwnershipError } from "@/lib/clinic/ownership"
import { getScaleDefinition, isScaleCode } from "@/lib/scales"

/**
 * GET /api/patients/[id]/escalas/metadata — send/status metadata ONLY, with no
 * scores/answers/risk. This is the ADMIN view (escalas = NONE) gated by
 * `patients ≥ READ` so the front desk can support operations (resend chasing).
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (_req: NextRequest, { user }, params) => {
    try {
      await assertPatientInClinic(user.clinicId, params.id)

      const rows = await prisma.scaleAdministration.findMany({
        where: { clinicId: user.clinicId, patientId: params.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          scaleCode: true,
          status: true,
          source: true,
          sentAt: true,
          completedAt: true,
          createdAt: true,
        },
      })

      const administrations = rows.map((r) => ({
        ...r,
        shortName: isScaleCode(r.scaleCode) ? getScaleDefinition(r.scaleCode).shortName : r.scaleCode,
      }))

      return NextResponse.json({ administrations })
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
      }
      throw e
    }
  }
)
