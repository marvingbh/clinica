import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateToken, invalidateToken } from "@/lib/appointments"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"

/**
 * POST /api/public/appointments/cancel
 * Cancels an appointment using a secure token
 *
 * Request body: { token: string, reason?: string }
 *
 * This endpoint is public (no auth required) - patients use the token link
 * Rate limited to prevent abuse
 */
export async function POST(req: NextRequest) {
  // Rate limiting by IP
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

  let body: { token?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Requisicao invalida" },
      { status: 400 }
    )
  }

  const { token, reason } = body

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Token nao fornecido" },
      { status: 400 }
    )
  }

  // Validate the token
  const validation = await validateToken(token, "cancel", prisma)

  if (!validation.valid) {
    // Check if it's because already cancelled
    const tokenRecord = await prisma.appointmentToken.findUnique({
      where: { token },
      include: {
        appointment: {
          include: {
            professionalProfile: {
              include: {
                user: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    })

    if (tokenRecord?.appointment?.status === "CANCELADO_ACORDADO" ||
        tokenRecord?.appointment?.status === "CANCELADO_FALTA" ||
        tokenRecord?.appointment?.status === "CANCELADO_PROFISSIONAL") {
      return NextResponse.json(
        {
          error: "Este agendamento ja foi cancelado",
          alreadyCancelled: true,
          appointment: {
            id: tokenRecord.appointment.id,
            professionalName: tokenRecord.appointment.professionalProfile.user.name,
            scheduledAt: tokenRecord.appointment.scheduledAt.toISOString(),
            endAt: tokenRecord.appointment.endAt.toISOString(),
            modality: tokenRecord.appointment.modality,
          },
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    )
  }

  // Get full appointment details before update for audit log
  const existingAppointment = await prisma.appointment.findUnique({
    where: { id: validation.appointmentId },
    include: {
      professionalProfile: {
        include: {
          user: {
            select: { name: true },
          },
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
    where: { id: validation.appointmentId },
    data: {
      status: "CANCELADO_ACORDADO",
      cancelledAt: new Date(),
      cancellationReason,
    },
    include: {
      professionalProfile: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
    },
  })

  // Create AuditLog entry for patient-initiated cancellation
  await prisma.auditLog.create({
    data: {
      clinicId: existingAppointment.clinicId,
      userId: null, // Patient-initiated, no user session
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

  // Invalidate the token (one-time use)
  await invalidateToken(token, prisma)

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
