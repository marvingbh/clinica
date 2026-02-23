import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyLink } from "@/lib/appointments/appointment-links"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"

/**
 * POST /api/public/appointments/cancel
 * Cancels an appointment using HMAC-signed parameters
 *
 * Request body: { id: string, expires: number, sig: string, reason?: string }
 *
 * This endpoint is public (no auth required) - patients use signed links
 * Rate limited to prevent abuse
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             req.headers.get("x-real-ip") ||
             "unknown"

  const rateLimitResult = await checkRateLimit(`appointment-cancel:${ip}`, RATE_LIMIT_CONFIGS.publicApi)

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimitResult.retryAfter / 1000)),
        },
      }
    )
  }

  let body: { id?: string; expires?: number; sig?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Requisicao invalida" },
      { status: 400 }
    )
  }

  const { id, expires, sig, reason } = body

  if (!id || expires == null || !sig) {
    return NextResponse.json(
      { error: "Parametros incompletos" },
      { status: 400 }
    )
  }

  // Verify HMAC signature
  const verification = verifyLink(id, "cancel", expires, sig)

  if (!verification.valid) {
    // Even if link is invalid/expired, check if already cancelled (preserve UX)
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        professionalProfile: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
    })

    if (appointment?.status === "CANCELADO_ACORDADO" ||
        appointment?.status === "CANCELADO_FALTA" ||
        appointment?.status === "CANCELADO_PROFISSIONAL") {
      return NextResponse.json(
        {
          error: "Este agendamento ja foi cancelado",
          alreadyCancelled: true,
          appointment: {
            id: appointment.id,
            professionalName: appointment.professionalProfile.user.name,
            scheduledAt: appointment.scheduledAt.toISOString(),
            endAt: appointment.endAt.toISOString(),
            modality: appointment.modality,
          },
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: verification.error },
      { status: 400 }
    )
  }

  // Get full appointment details before update for audit log
  const existingAppointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      professionalProfile: {
        include: {
          user: { select: { name: true } },
        },
      },
      patient: {
        select: { name: true },
      },
    },
  })

  if (!existingAppointment) {
    return NextResponse.json(
      { error: "Agendamento nao encontrado" },
      { status: 400 }
    )
  }

  const cancellationReason = reason?.trim() || "Cancelado pelo paciente via link"

  // Update appointment status to CANCELADO_ACORDADO (patient initiated via link)
  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      status: "CANCELADO_ACORDADO",
      cancelledAt: new Date(),
      cancellationReason,
    },
    include: {
      professionalProfile: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  })

  // Create AuditLog entry for patient-initiated cancellation
  await prisma.auditLog.create({
    data: {
      clinicId: existingAppointment.clinicId,
      userId: null,
      action: "PATIENT_CANCELLATION",
      entityType: "Appointment",
      entityId: appointment.id,
      oldValues: {
        status: existingAppointment.status,
      },
      newValues: {
        status: "CANCELADO_ACORDADO",
        cancellationReason,
        cancelledAt: appointment.cancelledAt?.toISOString(),
      },
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  return NextResponse.json({
    success: true,
    message: "Agendamento cancelado com sucesso",
    appointment: {
      id: appointment.id,
      professionalName: appointment.professionalProfile.user.name,
      scheduledAt: appointment.scheduledAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      modality: appointment.modality,
    },
  })
}
