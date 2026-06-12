import { NextRequest, NextResponse } from "next/server"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import {
  generateOtpCode,
  hashOtpCode,
  normalizeIdentifier,
  otpExpiry,
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_MINUTES,
  type PortalIdentifier,
} from "@/lib/patient-portal"
import { resolvePortalClinic } from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"

const OK = NextResponse.json(
  { ok: true },
  { headers: { "Cache-Control": "private, no-store" } },
)

/**
 * POST /api/public/portal/[slug]/otp/request
 * Always responds { ok: true } (anti-enumeration). Internally: resolves the
 * clinic, matches active patients by identifier, applies a consent gate, and
 * — when WhatsApp is the channel but the mock provider can't deliver — falls
 * back to e-mail if the patient has one.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req.headers)
  const ipRate = await checkRateLimit(`portal-otp-req:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!ipRate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 })
  }

  const { slug } = await params
  let body: { identifier?: string }
  try {
    body = await req.json()
  } catch {
    return OK
  }

  const identifier = body.identifier ? normalizeIdentifier(body.identifier) : null
  // Always do the (cheap) clinic resolution; bail with 200 on any miss.
  const resolved = await resolvePortalClinic(slug)
  if (!resolved || !identifier) return OK
  const { clinic } = resolved

  // Per-identifier throttle (DB-backed; resilient to serverless rate-limit gaps).
  const windowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_MINUTES * 60 * 1000)
  const recentCount = await prisma.patientPortalOtp.count({
    where: { clinicId: clinic.id, identifier: identifier.value, createdAt: { gte: windowStart } },
  })
  if (recentCount >= OTP_MAX_REQUESTS_PER_WINDOW) return OK

  await dispatchOtp(clinic.id, clinic.name, identifier)
  return OK
}

async function dispatchOtp(
  clinicId: string,
  clinicName: string,
  identifier: PortalIdentifier,
): Promise<void> {
  // Find active patients matching the verified identifier.
  const patients = await prisma.patient.findMany({
    where: {
      clinicId,
      isActive: true,
      OR:
        identifier.kind === "email"
          ? [{ email: identifier.value }]
          : [
              { phone: identifier.value },
              { additionalPhones: { some: { phone: identifier.value, notify: true } } },
            ],
    },
    select: {
      email: true,
      consentWhatsApp: true,
      consentEmail: true,
    },
  })

  if (patients.length === 0) return

  // Determine channel + recipient with consent gating + WhatsApp-mock fallback.
  let channel: NotificationChannel | null = null
  let recipient: string | null = null

  if (identifier.kind === "email") {
    // E-mail login: requires e-mail consent on at least one matched profile.
    if (patients.some((p) => p.consentEmail)) {
      channel = NotificationChannel.EMAIL
      recipient = identifier.value
    }
  } else {
    // Phone login: WhatsApp is mock (no delivery). Fall back to e-mail when a
    // matched profile has a consented e-mail address.
    const emailProfile = patients.find((p) => p.email && p.consentEmail)
    if (emailProfile?.email) {
      channel = NotificationChannel.EMAIL
      recipient = emailProfile.email
    } else if (patients.some((p) => p.consentWhatsApp)) {
      channel = NotificationChannel.WHATSAPP
      recipient = identifier.value
    }
  }

  if (!channel || !recipient) return

  const secret = process.env.AUTH_SECRET
  if (!secret) return

  const code = generateOtpCode()
  const codeHash = hashOtpCode(secret, clinicId, identifier.value, code)

  await prisma.patientPortalOtp.create({
    data: {
      clinicId,
      identifier: identifier.value,
      codeHash,
      channel,
      expiresAt: otpExpiry(new Date()),
    },
  })

  const template = await getTemplate(clinicId, NotificationType.PATIENT_PORTAL_OTP, channel)
  const variables = { otpCode: code, clinicName }
  const content = renderTemplate(template.content, variables)
  const subject = template.subject ? renderTemplate(template.subject, variables) : undefined

  try {
    await createAndSendNotification({
      clinicId,
      type: NotificationType.PATIENT_PORTAL_OTP,
      channel,
      recipient,
      subject,
      content,
    })
  } catch (err) {
    console.error("Portal OTP dispatch failed:", err)
  }

  await prisma.auditLog.create({
    data: {
      clinicId,
      userId: null,
      action: "PORTAL_OTP_REQUESTED",
      entityType: "PatientPortalOtp",
      entityId: identifier.value,
      newValues: { channel, kind: identifier.kind },
    },
  })
}
