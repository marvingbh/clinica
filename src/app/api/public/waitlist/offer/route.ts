import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { hashOfferToken, isOfferExpired } from "@/lib/waitlist"

/**
 * GET /api/public/waitlist/offer?token=
 * Returns the slot details for a still-open offer. Never leaks patient data.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  const rl = await checkRateLimit(`waitlist-offer:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } }
    )
  }

  const token = new URL(req.url).searchParams.get("token")
  if (!token) {
    return NextResponse.json({ error: "Token ausente" }, { status: 400 })
  }

  const offer = await prisma.waitlistOffer.findUnique({
    where: { tokenHash: hashOfferToken(token) },
    select: {
      status: true,
      expiresAt: true,
      slotStart: true,
      slotEnd: true,
      modality: true,
      clinic: { select: { name: true, timezone: true } },
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })

  if (!offer || isOfferExpired(offer, new Date())) {
    return NextResponse.json(
      {
        error:
          "Este link expirou ou o horário já foi preenchido. Você continua na lista de espera.",
        expired: true,
      },
      { status: 404 }
    )
  }

  return NextResponse.json({
    professionalName: offer.professionalProfile.user.name,
    clinicName: offer.clinic.name,
    scheduledAt: offer.slotStart.toISOString(),
    endAt: offer.slotEnd.toISOString(),
    modality: offer.modality,
    expiresAt: offer.expiresAt.toISOString(),
    timezone: offer.clinic.timezone || "America/Sao_Paulo",
  })
}
