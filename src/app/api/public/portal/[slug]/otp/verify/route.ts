import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import {
  generateSessionToken,
  hashSessionToken,
  initialSessionExpiry,
  isOtpUsable,
  normalizeIdentifier,
  verifyOtpCode,
} from "@/lib/patient-portal"
import {
  resolvePortalClinic,
  resolveAccessiblePatientIds,
  buildPortalProfiles,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp, setPortalCookie } from "@/lib/patient-portal/portal-cookies"

const INVALID = NextResponse.json(
  { error: "Código inválido ou expirado. Tente novamente." },
  { status: 400, headers: { "Cache-Control": "private, no-store" } },
)

/**
 * POST /api/public/portal/[slug]/otp/verify
 * Verifies a 6-digit code, creates a FULL session, sets the cookie, and returns
 * the accessible profiles. Increments attempts on failure; consumes on success.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`portal-otp-verify:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 })
  }

  const { slug } = await params
  let body: { identifier?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return INVALID
  }

  const identifier = body.identifier ? normalizeIdentifier(body.identifier) : null
  const code = (body.code ?? "").trim()
  if (!identifier || !/^\d{6}$/.test(code)) return INVALID

  const resolved = await resolvePortalClinic(slug)
  if (!resolved) return INVALID
  const { clinic } = resolved

  const secret = process.env.AUTH_SECRET
  if (!secret) return INVALID

  const now = new Date()
  // Most recent unconsumed OTP for this identifier.
  const otp = await prisma.patientPortalOtp.findFirst({
    where: { clinicId: clinic.id, identifier: identifier.value, consumedAt: null },
    orderBy: { createdAt: "desc" },
  })
  if (!otp) return INVALID

  const usability = isOtpUsable(otp, now)
  if (!usability.usable) return INVALID

  const matches = verifyOtpCode({
    secret,
    clinicId: clinic.id,
    identifier: identifier.value,
    code,
    codeHash: otp.codeHash,
  })

  if (!matches) {
    await prisma.patientPortalOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    })
    return INVALID
  }

  // Consume the code.
  await prisma.patientPortalOtp.update({
    where: { id: otp.id },
    data: { consumedAt: now, attempts: { increment: 1 } },
  })

  const patientIds = await resolveAccessiblePatientIds({
    clinicId: clinic.id,
    scope: "FULL",
    identifier: identifier.value,
    patientId: null,
  })
  if (patientIds.length === 0) return INVALID

  // Create the session.
  const token = generateSessionToken()
  const { expiresAt, absoluteExpiresAt } = initialSessionExpiry(now)
  const session = await prisma.patientPortalSession.create({
    data: {
      clinicId: clinic.id,
      identifier: identifier.value,
      scope: "FULL",
      tokenHash: hashSessionToken(token),
      expiresAt,
      absoluteExpiresAt,
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  await setPortalCookie(slug, token, "FULL")

  await prisma.auditLog.create({
    data: {
      clinicId: clinic.id,
      userId: null,
      action: "PORTAL_LOGIN",
      entityType: "PatientPortalSession",
      entityId: session.id,
      newValues: { identifierKind: identifier.kind, profiles: patientIds.length },
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  })

  const profiles = await buildPortalProfiles(clinic.id, patientIds, now)
  return NextResponse.json(
    { profiles },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
