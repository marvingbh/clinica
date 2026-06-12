import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { rescheduleTodoTitle } from "@/lib/patient-portal"
import {
  withPortalSession,
  readOnlyResponse,
  loadPortalAppointment,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

const schema = z.object({
  message: z.string().trim().max(1000).optional(),
  preferences: z
    .array(z.object({ day: z.string().max(40), period: z.string().max(40) }))
    .max(3)
    .optional(),
})

/**
 * POST /api/public/portal/[slug]/appointments/[id]/reschedule-request
 * Creates a RESCHEDULE PortalRequest and a Todo for the session's professional.
 */
export const POST = withPortalSession(async (req, ctx, params) => {
  if (ctx.access === "read_only") return readOnlyResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const appt = await loadPortalAppointment(ctx, params.id)
  if (!appt || !appt.patientId) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
  }

  const patient = await prisma.patient.findFirst({
    where: { id: appt.patientId, clinicId: ctx.clinic.id },
    select: { name: true },
  })
  if (!patient) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })

  const request = await prisma.portalRequest.create({
    data: {
      clinicId: ctx.clinic.id,
      patientId: appt.patientId,
      appointmentId: appt.id,
      type: "RESCHEDULE",
      payload: {
        message: parsed.data.message ?? null,
        preferences: parsed.data.preferences ?? [],
      } as unknown as Prisma.InputJsonValue,
    },
  })

  // A todo for the professional handling this session (day = today).
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.todo.create({
    data: {
      clinicId: ctx.clinic.id,
      professionalProfileId: appt.professionalProfileId,
      title: rescheduleTodoTitle({ patientName: patient.name, scheduledAt: appt.scheduledAt }),
      notes: parsed.data.message ?? null,
      day: today,
    },
  })

  const ip = getClientIp(req.headers)
  await prisma.auditLog.create({
    data: {
      clinicId: ctx.clinic.id,
      userId: null,
      action: "PORTAL_RESCHEDULE_REQUESTED",
      entityType: "PortalRequest",
      entityId: request.id,
      newValues: { patientId: appt.patientId, appointmentId: appt.id },
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  return NextResponse.json({ requestId: request.id })
})
