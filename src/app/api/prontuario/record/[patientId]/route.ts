import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertPatientInClinic } from "@/lib/clinic/ownership"
import { canDispose, clampRetentionYears, formatRetentionBanner } from "@/lib/prontuario"
import { recordActionSchema } from "../../_schemas"
import { ownershipErrorResponse } from "../../_helpers"

/** GET /api/prontuario/record/[patientId] — lifecycle state for the panel. */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (_req, { user }, params) => {
    try {
      await assertPatientInClinic(user.clinicId, params.patientId)
    } catch (error) {
      const res = ownershipErrorResponse(error)
      if (res) return res
      throw error
    }

    const [patient, clinic] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: params.patientId, clinicId: user.clinicId },
        select: { recordClosedAt: true },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { prontuarioRetentionYears: true },
      }),
    ])

    const retentionYears = clampRetentionYears(clinic?.prontuarioRetentionYears ?? 5)
    const closed = patient?.recordClosedAt ?? null
    const now = new Date()

    return NextResponse.json({
      recordClosedAt: closed,
      retentionYears,
      banner: closed ? formatRetentionBanner(closed, retentionYears, now) : null,
      canDispose: canDispose(closed, retentionYears, now).ok,
    })
  }
)

/** PATCH /api/prontuario/record/[patientId] — close/reopen the record. */
export const PATCH = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json().catch(() => null)
    const parsed = recordActionSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

    try {
      await assertPatientInClinic(user.clinicId, params.patientId)
    } catch (error) {
      const res = ownershipErrorResponse(error)
      if (res) return res
      throw error
    }

    const recordClosedAt = parsed.data.action === "close" ? new Date() : null
    await prisma.patient.updateMany({
      where: { id: params.patientId, clinicId: user.clinicId },
      data: { recordClosedAt },
    })

    await audit.log({
      user,
      action:
        parsed.data.action === "close"
          ? AuditAction.PATIENT_RECORD_CLOSED
          : AuditAction.PATIENT_RECORD_REOPENED,
      entityType: "Patient",
      entityId: params.patientId,
      newValues: { recordClosedAt },
      request: req,
    })

    return NextResponse.json({ success: true, recordClosedAt })
  }
)
