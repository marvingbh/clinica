import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import {
  agendaSessionExpiry,
  generateSessionToken,
  hashSessionToken,
  verifyPortalLink,
} from "@/lib/patient-portal"
import {
  resolvePortalClinic,
  buildPortalProfiles,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp, setPortalCookie } from "@/lib/patient-portal/portal-cookies"

const EXPIRED = NextResponse.json(
  { error: "Link expirado — entre com seu telefone ou e-mail." },
  { status: 400, headers: { "Cache-Control": "private, no-store" } },
)

/**
 * POST /api/public/portal/[slug]/session/link
 * Exchanges a signed deep-link token for a 24h AGENDA-scope session (one patient,
 * sessions-only). Financeiro/Documentos/Dados require OTP elevation.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`portal-link:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 })
  }

  const { slug } = await params
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return EXPIRED
  }

  const verification = body.token ? verifyPortalLink(body.token) : { valid: false as const }
  if (!verification.valid || verification.clinicSlug !== slug || !verification.patientId) {
    return EXPIRED
  }

  const resolved = await resolvePortalClinic(slug)
  if (!resolved) return EXPIRED
  const { clinic } = resolved

  // Pinned patient must still belong to the clinic and be active.
  const patient = await prisma.patient.findFirst({
    where: { id: verification.patientId, clinicId: clinic.id, isActive: true },
    select: { id: true, phone: true },
  })
  if (!patient) return EXPIRED

  const now = new Date()
  const token = generateSessionToken()
  const { expiresAt, absoluteExpiresAt } = agendaSessionExpiry(now)
  const session = await prisma.patientPortalSession.create({
    data: {
      clinicId: clinic.id,
      identifier: patient.phone,
      patientId: patient.id,
      scope: "AGENDA",
      tokenHash: hashSessionToken(token),
      expiresAt,
      absoluteExpiresAt,
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  await setPortalCookie(slug, token, "AGENDA")

  await prisma.auditLog.create({
    data: {
      clinicId: clinic.id,
      userId: null,
      action: "PORTAL_LOGIN_LINK",
      entityType: "PatientPortalSession",
      entityId: session.id,
      newValues: { patientId: patient.id },
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  const profiles = await buildPortalProfiles(clinic.id, [patient.id], now)
  return NextResponse.json(
    { profiles },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
