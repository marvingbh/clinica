import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyLink, type LinkAction } from "@/lib/appointments/appointment-links"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"

/**
 * GET /api/public/appointments/lookup?id=...&action=confirm|cancel&expires=...&sig=...
 * Looks up appointment details for the confirmation/cancellation page
 * Does NOT modify the appointment - just returns details for display
 *
 * This endpoint is public (no auth required) - patients use signed links
 * Rate limited to prevent enumeration attacks
 */
export async function GET(req: NextRequest) {
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
  const id = searchParams.get("id")
  const action = searchParams.get("action") as LinkAction | null
  const expiresStr = searchParams.get("expires")
  const sig = searchParams.get("sig")

  if (!id || !action || !expiresStr || !sig) {
    return NextResponse.json(
      { error: "Parametros incompletos" },
      { status: 400 }
    )
  }

  if (action !== "confirm" && action !== "cancel") {
    return NextResponse.json(
      { error: "Acao invalida" },
      { status: 400 }
    )
  }

  const expires = Number(expiresStr)
  if (isNaN(expires)) {
    return NextResponse.json(
      { error: "Parametros invalidos" },
      { status: 400 }
    )
  }

  // Verify HMAC signature
  const verification = verifyLink(id, action, expires, sig)
  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error },
      { status: 400 }
    )
  }

  // Fetch appointment by ID
  const appointment = await prisma.appointment.findUnique({
    where: { id },
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

  if (!appointment) {
    return NextResponse.json(
      { error: "Agendamento nao encontrado" },
      { status: 400 }
    )
  }

  const appointmentDetails = {
    id: appointment.id,
    professionalName: appointment.professionalProfile.user.name,
    scheduledAt: appointment.scheduledAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    modality: appointment.modality,
  }

  // Action-specific status checks
  if (action === "confirm") {
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

    if (appointment.status !== "AGENDADO") {
      return NextResponse.json(
        { error: "Este agendamento nao pode mais ser confirmado" },
        { status: 400 }
      )
    }
  } else if (action === "cancel") {
    if (appointment.status === "CANCELADO_ACORDADO" ||
        appointment.status === "CANCELADO_FALTA" ||
        appointment.status === "CANCELADO_PROFISSIONAL") {
      return NextResponse.json(
        {
          error: "Este agendamento ja foi cancelado",
          alreadyCancelled: true,
          appointment: appointmentDetails,
        },
        { status: 400 }
      )
    }

    if (appointment.status !== "AGENDADO" && appointment.status !== "CONFIRMADO") {
      return NextResponse.json(
        { error: "Este agendamento nao pode mais ser cancelado" },
        { status: 400 }
      )
    }
  }

  return NextResponse.json({
    appointment: appointmentDetails,
  })
}
