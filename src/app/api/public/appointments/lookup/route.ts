import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"

/**
 * GET /api/public/appointments/lookup?token=xxx
 * Looks up appointment details for the confirmation page
 * Does NOT confirm the appointment - just returns details for display
 *
 * This endpoint is public (no auth required) - patients use the token link
 * Rate limited to prevent enumeration attacks
 */
export async function GET(req: NextRequest) {
  // Rate limiting by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             req.headers.get("x-real-ip") ||
             "unknown"

  const rateLimitResult = await checkRateLimit(`appointment-lookup:${ip}`, RATE_LIMIT_CONFIGS.publicApi)

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

  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.json(
      { error: "Token nao fornecido" },
      { status: 400 }
    )
  }

  // Find the token and associated appointment
  const tokenRecord = await prisma.appointmentToken.findUnique({
    where: { token },
    include: {
      appointment: {
        include: {
          professionalProfile: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!tokenRecord) {
    return NextResponse.json(
      { error: "Link invalido ou expirado" },
      { status: 400 }
    )
  }

  if (tokenRecord.action !== "confirm") {
    return NextResponse.json(
      { error: "Link invalido para esta acao" },
      { status: 400 }
    )
  }

  if (new Date() > tokenRecord.expiresAt) {
    return NextResponse.json(
      { error: "Este link expirou. Entre em contato com a clinica para um novo link." },
      { status: 400 }
    )
  }

  if (!tokenRecord.appointment) {
    return NextResponse.json(
      { error: "Agendamento nao encontrado" },
      { status: 400 }
    )
  }

  const appointment = tokenRecord.appointment
  const appointmentDetails = {
    id: appointment.id,
    professionalName: appointment.professionalProfile.user.name,
    scheduledAt: appointment.scheduledAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    modality: appointment.modality,
  }

  // Check if already confirmed
  if (appointment.status === "CONFIRMADO") {
    return NextResponse.json(
      {
        error: "Este agendamento ja foi confirmado",
        alreadyConfirmed: true,
        appointment: appointmentDetails,
      },
      { status: 400 }
    )
  }

  // Check if token was already used
  if (tokenRecord.usedAt) {
    return NextResponse.json(
      { error: "Este link ja foi utilizado" },
      { status: 400 }
    )
  }

  // Check if appointment is in a valid state for confirmation
  if (appointment.status !== "AGENDADO") {
    return NextResponse.json(
      { error: "Este agendamento nao pode mais ser confirmado" },
      { status: 400 }
    )
  }

  return NextResponse.json({
    appointment: appointmentDetails,
  })
}
