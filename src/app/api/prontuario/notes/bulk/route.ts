import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertAppointmentInClinic } from "@/lib/clinic/ownership"
import { buildGroupDraftInputs, type GroupMemberAppointment } from "@/lib/prontuario"
import { bulkNotesSchema } from "../../_schemas"
import { ownershipErrorResponse } from "../../_helpers"

/**
 * POST /api/prontuario/notes/bulk — create a draft per group member appointment.
 * Skips members that already have a note (enforced by the prof+appointment
 * unique constraint via createMany skipDuplicates).
 */
export const POST = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }) => {
    if (!user.professionalProfileId) {
      return NextResponse.json(
        { error: "Apenas profissionais podem criar registros clínicos." },
        { status: 422 }
      )
    }

    const body = await req.json().catch(() => null)
    const parsed = bulkNotesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    try {
      const members: GroupMemberAppointment[] = []
      for (const appointmentId of parsed.data.appointmentIds) {
        const appt = await assertAppointmentInClinic(user.clinicId, appointmentId)
        if (appt.type !== "CONSULTA" || appt.patientId == null) continue
        members.push({
          appointmentId: appt.id,
          patientId: appt.patientId,
          scheduledAt: appt.scheduledAt,
        })
      }

      const existing = await prisma.clinicalNote.findMany({
        where: {
          clinicId: user.clinicId,
          professionalProfileId: user.professionalProfileId,
          appointmentId: { in: members.map((m) => m.appointmentId) },
        },
        select: { appointmentId: true },
      })
      const existingApptIds = new Set(
        existing.map((e) => e.appointmentId).filter((id): id is string => id !== null)
      )

      const { drafts, skipped } = buildGroupDraftInputs(members, existingApptIds, {
        clinicId: user.clinicId,
        professionalProfileId: user.professionalProfileId,
        format: "SOAP",
        templateId: null,
      })

      if (drafts.length > 0) {
        await prisma.clinicalNote.createMany({
          data: drafts.map((d) => ({
            clinicId: d.clinicId,
            patientId: d.patientId,
            professionalProfileId: d.professionalProfileId,
            appointmentId: d.appointmentId,
            templateId: d.templateId,
            format: d.format,
            noteType: "EVOLUCAO" as const,
            status: "RASCUNHO" as const,
            sessionDate: d.sessionDate,
          })),
          skipDuplicates: true,
        })
      }

      const created = await prisma.clinicalNote.findMany({
        where: {
          clinicId: user.clinicId,
          professionalProfileId: user.professionalProfileId,
          appointmentId: { in: drafts.map((d) => d.appointmentId) },
        },
        select: { id: true, appointmentId: true },
      })

      await audit.log({
        user,
        action: AuditAction.CLINICAL_NOTE_CREATED,
        entityType: "ClinicalNote",
        entityId: "bulk",
        newValues: { created: created.length, skipped: skipped.length },
        request: req,
      })

      return NextResponse.json({ created: created.map((c) => c.id), skipped })
    } catch (error) {
      const res = ownershipErrorResponse(error)
      if (res) return res
      throw error
    }
  }
)
