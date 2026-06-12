import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canCancelInPortal, toPortalAppointment } from "@/lib/patient-portal"
import {
  withPortalSession,
  readOnlyResponse,
  loadPortalAppointment,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

/**
 * POST /api/public/portal/[slug]/appointments/[id]/cancel
 * Patient cancels within the clinic's window (CANCELADO_ACORDADO).
 */
export const POST = withPortalSession(async (req, ctx, params) => {
  if (ctx.access === "read_only") return readOnlyResponse()

  let body: { reason?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const appt = await loadPortalAppointment(ctx, params.id)
  if (!appt) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })

  const now = new Date()
  const decision = canCancelInPortal({
    status: appt.status,
    scheduledAt: appt.scheduledAt,
    now,
    minHours: ctx.clinic.portalCancelMinHours,
  })

  if (!decision.allowed) {
    if (decision.reason === "window") {
      return NextResponse.json(
        {
          error: `Cancelamento disponível até ${ctx.clinic.portalCancelMinHours}h antes da sessão. Fale com a clínica ou solicite reagendamento.`,
        },
        { status: 422 },
      )
    }
    // status already cancelled/finalized — revalidated against DB above.
    return NextResponse.json({ error: "Esta sessão já foi cancelada." }, { status: 409 })
  }

  const cancellationReason = body.reason?.trim() || "Cancelado pelo paciente via portal"
  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "CANCELADO_ACORDADO", cancelledAt: now, cancellationReason },
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
      action: "PORTAL_APPOINTMENT_CANCELLED",
      entityType: "Appointment",
      entityId: appt.id,
      oldValues: { status: appt.status },
      newValues: { status: "CANCELADO_ACORDADO", cancellationReason, patientId: appt.patientId },
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  return NextResponse.json({ appointment: toPortalAppointment(updated) })
})
