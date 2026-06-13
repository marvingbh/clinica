import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { OwnershipError } from "@/lib/clinic/ownership"
import { canViewScaleContent, listScales } from "@/lib/scales"

/**
 * GET /api/patients/[id]/escalas — full clinical view (scores/answers/risk)
 * for a treating professional (or ADMIN with an override). Audits scale.viewed.
 */
export const GET = withFeatureAuth(
  { feature: "escalas", minAccess: "READ" },
  async (req: NextRequest, { user, access }, params) => {
    const patientId = params.id
    try {
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: user.clinicId },
        select: { id: true, referenceProfessionalId: true },
      })
      if (!patient) throw new OwnershipError()

      const hasAppointment =
        user.professionalProfileId !== null &&
        (await prisma.appointment.count({
          where: {
            clinicId: user.clinicId,
            patientId,
            professionalProfileId: user.professionalProfileId,
          },
        })) > 0

      const allowed = canViewScaleContent({
        viewerRole: user.role,
        viewerEscalasAccess: access,
        viewerProfessionalProfileId: user.professionalProfileId,
        patientReferenceProfessionalId: patient.referenceProfessionalId,
        viewerHasAppointmentWithPatient: hasAppointment,
      })
      if (!allowed) {
        return NextResponse.json({ error: "Acesso negado às escalas deste paciente" }, { status: 403 })
      }

      const [administrations, schedules] = await Promise.all([
        prisma.scaleAdministration.findMany({
          where: { clinicId: user.clinicId, patientId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            scaleCode: true,
            source: true,
            status: true,
            answers: true,
            totalScore: true,
            severityLabel: true,
            riskFlag: true,
            sentAt: true,
            completedAt: true,
            createdAt: true,
            professionalProfile: { select: { user: { select: { name: true } } } },
          },
        }),
        prisma.scaleSchedule.findMany({
          where: { clinicId: user.clinicId, patientId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            scaleCode: true,
            cadenceType: true,
            intervalWeeks: true,
            active: true,
            pausedReason: true,
            lastSentAt: true,
          },
        }),
      ])

      await audit.log({
        user,
        action: AuditAction.SCALE_VIEWED,
        entityType: "Patient",
        entityId: patientId,
        request: req,
      })

      return NextResponse.json({ administrations, schedules, scales: listScales() })
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
      }
      throw e
    }
  }
)
