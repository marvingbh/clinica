import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { acceptOfferByToken, sendExpiryNotification } from "@/lib/waitlist"
import { AuditAction } from "@/lib/rbac/audit"

/**
 * POST /api/public/waitlist/offer/accept  { token }
 * Transactionally accepts the offer (creates the appointment, converts the
 * entry, expires siblings), then sends notifications and audits.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  const rl = await checkRateLimit(`waitlist-accept:${ip}`, RATE_LIMIT_CONFIGS.sensitive)
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

  const now = new Date()
  const result = await acceptOfferByToken(body.token, now)

  if (result.kind === "not_found") {
    return NextResponse.json({ error: "Esta oferta não está mais disponível" }, { status: 400 })
  }
  if (result.kind === "expired" || result.kind === "conflict") {
    return NextResponse.json(
      {
        error:
          "Este link expirou ou o horário já foi preenchido. Você continua na lista de espera.",
        filled: true,
      },
      { status: 409 }
    )
  }

  // Audit the conversion (no user — public flow).
  await prisma.auditLog.create({
    data: {
      clinicId: result.clinicId,
      userId: null,
      action: AuditAction.WAITLIST_OFFER_ACCEPTED,
      entityType: "WaitlistEntry",
      entityId: result.entryId,
      newValues: { appointmentId: result.appointmentId },
    },
  })
  await prisma.auditLog.create({
    data: {
      clinicId: result.clinicId,
      userId: null,
      action: AuditAction.WAITLIST_CONVERTED,
      entityType: "Appointment",
      entityId: result.appointmentId,
      newValues: { entryId: result.entryId },
    },
  })

  // Polite "slot filled" notices to siblings whose offers were expired.
  for (const sibling of result.siblingPatients) {
    try {
      await sendExpiryNotification({
        clinicId: result.clinicId,
        clinicName: result.clinicName,
        patient: sibling,
        slot: { scheduledAt: result.slotStart },
        timezone: result.timezone,
      })
    } catch (err) {
      console.error("[waitlist-accept] sibling notice failed:", err)
    }
  }

  return NextResponse.json({ success: true })
}
