import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { resolvePortalAccess } from "@/lib/patient-portal"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

/**
 * GET /api/public/portal/[slug]/config
 * Branding + portal enablement for the login screen. Always returns 200 with
 * `portalEnabled: false` for unknown/disabled clinics (no tenant enumeration).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`portal-config:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 })
  }

  const { slug } = await params
  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: {
      name: true,
      logoData: true,
      isActive: true,
      patientPortalEnabled: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      plan: { select: { allowPatientPortal: true } },
    },
  })

  if (!clinic) {
    return NextResponse.json(
      { name: null, hasLogo: false, portalEnabled: false },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  }

  const access = resolvePortalAccess({
    planAllows: !!clinic.plan?.allowPatientPortal,
    clinicEnabled: clinic.patientPortalEnabled,
    clinicActive: clinic.isActive,
    subscription: { subscriptionStatus: clinic.subscriptionStatus, trialEndsAt: clinic.trialEndsAt },
  })

  return NextResponse.json(
    {
      name: clinic.name,
      hasLogo: !!clinic.logoData,
      portalEnabled: access !== "disabled",
      readOnly: access === "read_only",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
