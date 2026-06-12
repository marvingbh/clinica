import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canConfirmInPortal, toPortalAppointment } from "@/lib/patient-portal"
import {
  withPortalSession,
  readOnlyResponse,
  loadPortalAppointment,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

/**
 * POST /api/public/portal/[slug]/appointments/[id]/confirm
 * Patient confirms presence (AGENDADO → CONFIRMADO).
 */
export const POST = withPortalSession(async (req, ctx, params) => {
  if (ctx.access === "read_only") return readOnlyResponse()

  const appt = await loadPortalAppointment(ctx, params.id)
  if (!appt) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })

  if (!canConfirmInPortal(appt.status)) {
    return NextResponse.json(
      { error: "Esta sessão não pode ser confirmada." },
      { status: 409 },
    )
  }

  const now = new Date()
  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "CONFIRMADO", confirmedAt: now },
    select: {
      id: true,
      scheduledAt: true,
      endAt: true,
      status: true,
      modality: true,
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })

  const ip = getClientIp(req.headers)
  await prisma.auditLog.create({
    data: {
      clinicId: ctx.clinic.id,
      userId: null,
      action: "PORTAL_APPOINTMENT_CONFIRMED",
      entityType: "Appointment",
      entityId: appt.id,
      oldValues: { status: appt.status },
      newValues: { status: "CONFIRMADO", patientId: appt.patientId },
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  return NextResponse.json({ appointment: toPortalAppointment(updated) })
})
