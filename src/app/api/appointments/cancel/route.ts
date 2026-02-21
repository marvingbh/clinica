import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateToken, invalidateToken } from "@/lib/appointments"

/**
 * GET /api/appointments/cancel?token=xxx
 * Cancels an appointment using a secure token
 *
 * This endpoint is public (no auth required) - patients use the token link
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.json(
      { error: "Token não fornecido" },
      { status: 400 }
    )
  }

  // Validate the token
  const validation = await validateToken(token, "cancel", prisma)

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    )
  }

  // Update appointment status to CANCELADO_ACORDADO (patient initiated via link)
  const appointment = await prisma.appointment.update({
    where: { id: validation.appointmentId },
    data: {
      status: "CANCELADO_ACORDADO",
      cancelledAt: new Date(),
      cancellationReason: "Cancelado pelo paciente via link",
    },
    include: {
      patient: {
        select: {
          name: true,
        },
      },
      professionalProfile: {
        select: {
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  })

  // Invalidate the token (one-time use)
  await invalidateToken(token, prisma)

  return NextResponse.json({
    success: true,
    message: "Agendamento cancelado com sucesso",
    appointment: {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      patientName: appointment.patient?.name || appointment.title || null,
      professionalName: appointment.professionalProfile.user.name,
    },
  })
}
