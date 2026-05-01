import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyLink } from "@/lib/appointments/appointment-links"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"

/**
 * POST /api/public/appointments/confirm
 * Confirms an appointment using HMAC-signed parameters
 *
 * Request body: { id: string, expires: number, sig: string }
 *
 * This endpoint is public (no auth required) - patients use signed links
 * Rate limited to prevent abuse
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             req.headers.get("x-real-ip") ||
             "unknown"

  const rateLimitResult = await checkRateLimit(`appointment-confirm:${ip}`, RATE_LIMIT_CONFIGS.publicApi)

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

  let body: { id?: string; expires?: number; sig?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Requisicao invalida" },
      { status: 400 }
    )
  }

  const { id, expires, sig } = body

  if (!id || expires == null || !sig) {
    return NextResponse.json(
      { error: "Parametros incompletos" },
      { status: 400 }
    )
  }

  // Verify HMAC signature. B13: do NOT fall back to a DB lookup that leaks
  // `professionalName`/`scheduledAt` to anyone guessing an appointment ID.
  // Generic error only.
  const verification = verifyLink(id, "confirm", expires, sig)

  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error },
      { status: 400 }
    )
  }

  // Update appointment status to CONFIRMADO
  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      status: "CONFIRMADO",
      confirmedAt: new Date(),
    },
    include: {
      professionalProfile: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  })

  return NextResponse.json({
    success: true,
    message: "Agendamento confirmado com sucesso",
    appointment: {
      id: appointment.id,
      professionalName: appointment.professionalProfile.user.name,
      scheduledAt: appointment.scheduledAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      modality: appointment.modality,
    },
  })
}
