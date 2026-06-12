import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { loadBookingClinic } from "../../_lib/load-clinic"
import { computeProfessionalSlots } from "../../_lib/slot-data"
import { effectiveDuration, effectiveHorizon } from "../../_lib/resolve-duration"

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/public/booking/[slug]/slots?professional=<slug>&from=YYYY-MM-DD&days=<=14
 * Returns the free-slot grid for a professional. Public + rate-limited + CDN-cacheable.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const rate = await checkRateLimit(`booking-slots:${clientIp(req)}`, RATE_LIMIT_CONFIGS.bookingSlots)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const { slug } = await params
  const url = new URL(req.url)
  const professionalSlug = url.searchParams.get("professional") ?? ""
  const from = url.searchParams.get("from") ?? ""
  const daysParam = parseInt(url.searchParams.get("days") ?? "7", 10)
  const days = Math.min(Math.max(Number.isNaN(daysParam) ? 7 : daysParam, 1), 14)

  if (!DATE_RE.test(from) || !professionalSlug) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
  }

  const loaded = await loadBookingClinic(slug)
  if (loaded.kind === "not_found") {
    return NextResponse.json({ error: "Clínica não encontrada" }, { status: 404 })
  }
  if (loaded.kind === "closed") {
    return NextResponse.json({ closed: true, days: [] }, { status: 200 })
  }
  const clinic = loaded.clinic

  const profile = await prisma.professionalProfile.findFirst({
    where: {
      publicBookingSlug: professionalSlug,
      allowOnlineBooking: true,
      user: { clinicId: clinic.id, isActive: true },
    },
    select: {
      id: true,
      appointmentDuration: true,
      bufferBetweenSlots: true,
      maxAdvanceBookingDays: true,
    },
  })
  if (!profile) {
    return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 })
  }

  const result = await computeProfessionalSlots(
    {
      professionalProfileId: profile.id,
      clinicId: clinic.id,
      durationMinutes: effectiveDuration(profile.appointmentDuration, clinic.settings.sessionDurationMinutes),
      bufferMinutes: profile.bufferBetweenSlots,
      minAdvanceHours: clinic.settings.minAdvanceHours,
      horizonDays: effectiveHorizon(clinic.settings.horizonDays, profile.maxAdvanceBookingDays),
    },
    from,
    days,
    new Date()
  )

  return NextResponse.json(
    { days: result },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" } }
  )
}
