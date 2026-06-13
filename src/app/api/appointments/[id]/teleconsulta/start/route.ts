import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess, audit, AuditAction } from "@/lib/rbac"
import {
  resolveJoinState,
  resolveRoomKey,
  deriveRoomName,
  getTelehealthConfig,
  getVideoProvider,
} from "@/lib/telehealth"
import {
  loadTeleconsultaAppointment,
  canManageTeleconsulta,
} from "../shared"

/**
 * POST /api/appointments/[id]/teleconsulta/start
 * Opens the built-in room: records telehealthStartedAt (idempotent), audits,
 * and returns the moderator JoinInfo. Tenant-scoped + ownership-checked.
 */
export const POST = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const appointment = await loadTeleconsultaAppointment(params.id, user.clinicId)
    if (!appointment) {
      return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 })
    }

    if (!canManageTeleconsulta(appointment, user, meetsMinAccess(user.permissions.agenda_others, "WRITE"))) {
      return forbiddenResponse("Você só pode iniciar a teleconsulta dos seus próprios agendamentos")
    }

    const config = getTelehealthConfig()
    const state = resolveJoinState(
      appointment,
      { telehealthEnabled: appointment.clinic.telehealthEnabled },
      config,
      new Date()
    )

    if (["CANCELLED", "NOT_ONLINE", "DISABLED", "INVALID"].includes(state.kind)) {
      return NextResponse.json(
        { error: "Não é possível iniciar a teleconsulta para esta sessão.", state: state.kind },
        { status: 422 }
      )
    }

    // Idempotent: only set the first time the room is opened.
    if (!appointment.telehealthStartedAt) {
      await prisma.appointment.updateMany({
        where: { id: appointment.id, clinicId: user.clinicId, telehealthStartedAt: null },
        data: { telehealthStartedAt: new Date() },
      })
      await audit.log({
        user,
        action: AuditAction.TELECONSULTA_INICIADA,
        entityType: "Appointment",
        entityId: appointment.id,
        request: req,
      })
    }

    const secret = process.env.AUTH_SECRET ?? ""
    const join = getVideoProvider(config).professionalJoinInfo(
      { roomName: deriveRoomName(resolveRoomKey(appointment), secret) },
      appointment.professionalProfile.user.name
    )

    return NextResponse.json({ state: state.kind, join, externalUrl: appointment.meetingUrl })
  }
)
