import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import {
  resolveJoinState,
  resolveRoomKey,
  deriveRoomName,
  buildPatientVideoUrl,
  getTelehealthConfig,
  getVideoProvider,
} from "@/lib/telehealth"
import { loadTeleconsultaAppointment, canManageTeleconsulta } from "./shared"

/**
 * GET /api/appointments/[id]/teleconsulta
 * Professional/admin join info for the built-in room. Tenant-scoped by
 * clinicId; ownership enforced (agenda_others required for others' sessions).
 * TOO_EARLY does not block the professional — the state only drives UI.
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (_req, { user }, params) => {
    const appointment = await loadTeleconsultaAppointment(params.id, user.clinicId)
    if (!appointment) {
      return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 })
    }

    if (!canManageTeleconsulta(appointment, user, meetsMinAccess(user.permissions.agenda_others, "READ"))) {
      return forbiddenResponse("Você só pode acessar a teleconsulta dos seus próprios agendamentos")
    }

    const config = getTelehealthConfig()
    const state = resolveJoinState(
      appointment,
      { telehealthEnabled: appointment.clinic.telehealthEnabled },
      config,
      new Date()
    )

    const secret = process.env.AUTH_SECRET ?? ""
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const patientVideoUrl = buildPatientVideoUrl(baseUrl, appointment.id, secret)

    const blocked = ["CANCELLED", "NOT_ONLINE", "DISABLED", "INVALID"]
    const join = blocked.includes(state.kind)
      ? undefined
      : getVideoProvider(config).professionalJoinInfo(
          { roomName: deriveRoomName(resolveRoomKey(appointment), secret) },
          appointment.professionalProfile.user.name
        )

    return NextResponse.json({
      state: state.kind,
      join,
      externalUrl: appointment.meetingUrl,
      patientVideoUrl,
      professionalJoined: appointment.telehealthStartedAt != null,
    })
  }
)
