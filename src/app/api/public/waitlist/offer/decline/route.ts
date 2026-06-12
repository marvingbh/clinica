import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { hashOfferToken, isOfferExpired } from "@/lib/waitlist"
import { AuditAction } from "@/lib/rbac/audit"

/**
 * POST /api/public/waitlist/offer/decline  { token }
 * Marks the offer RECUSADA and returns the entry to ATIVA. The cron advances
 * the sequential chain on its next run.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  const rl = await checkRateLimit(`waitlist-decline:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } }
    )
  }

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
  }
  if (!body.token) {
    return NextResponse.json({ error: "Token ausente" }, { status: 400 })
  }

  const offer = await prisma.waitlistOffer.findUnique({
    where: { tokenHash: hashOfferToken(body.token) },
    select: { id: true, clinicId: true, entryId: true, status: true, expiresAt: true },
  })

  const now = new Date()
  if (!offer || isOfferExpired(offer, now)) {
    return NextResponse.json(
      { error: "Esta oferta não está mais disponível", expired: true },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.waitlistOffer.update({
      where: { id: offer.id },
      data: { status: "RECUSADA", respondedAt: now },
    }),
    prisma.waitlistEntry.update({
      where: { id: offer.entryId },
      data: { status: "ATIVA" },
    }),
  ])

  await prisma.auditLog.create({
    data: {
      clinicId: offer.clinicId,
      userId: null,
      action: AuditAction.WAITLIST_OFFER_DECLINED,
      entityType: "WaitlistOffer",
      entityId: offer.id,
      newValues: { entryId: offer.entryId },
    },
  })

  return NextResponse.json({ success: true })
}
