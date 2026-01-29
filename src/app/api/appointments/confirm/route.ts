import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateToken, invalidateToken } from "@/lib/appointments"

/**
 * GET /api/appointments/confirm?token=xxx
 * Confirms an appointment using a secure token
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
  const validation = await validateToken(token, "confirm", prisma)

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    )
  }

  // Update appointment status to CONFIRMADO
  const appointment = await prisma.appointment.update({
    where: { id: validation.appointmentId },
    data: {
      status: "CONFIRMADO",
      confirmedAt: new Date(),
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
    message: "Agendamento confirmado com sucesso",
    appointment: {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      patientName: appointment.patient.name,
      professionalName: appointment.professionalProfile.user.name,
    },
  })
}
