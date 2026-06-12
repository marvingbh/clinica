import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { buildAppointmentsIcsFeed } from "@/lib/calendar-sync"

/**
 * GET /api/public/calendar/[token]
 * Read-only iCal feed (no OAuth). The 256-bit token globally identifies the
 * integration (and thus the tenant). Serves the professional's syncable
 * appointments for the next 90 days (+7 past), with the same privacy mode as
 * the Google integration. Rate-limited by token+IP; generic 404 for bad tokens.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  const rl = await checkRateLimit(`ics:${token}:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) },
    })
  }

  if (!token || token.length < 16) {
    return new NextResponse("Not Found", { status: 404 })
  }

  const integration = await prisma.calendarIntegration.findUnique({
    where: { icsToken: token },
    include: { user: { select: { professionalProfile: { select: { id: true } } } } },
  })
  if (!integration) {
    return new NextResponse("Not Found", { status: 404 })
  }

  const professionalProfileId = integration.user.professionalProfile?.id
  const clinic = await prisma.clinic.findUnique({
    where: { id: integration.clinicId },
    select: { name: true, timezone: true },
  })

  const now = new Date()
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const appointments = professionalProfileId
    ? await prisma.appointment.findMany({
        where: {
          clinicId: integration.clinicId,
          professionalProfileId,
          scheduledAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          clinicId: true,
          type: true,
          status: true,
          scheduledAt: true,
          endAt: true,
          title: true,
          patient: { select: { name: true } },
        },
        orderBy: { scheduledAt: "asc" },
      })
    : []

  const feed = buildAppointmentsIcsFeed({
    calendarName: `${clinic?.name ?? "Clinica"} — Agenda`,
    clinicName: clinic?.name ?? "Clinica",
    timezone: clinic?.timezone ?? "America/Sao_Paulo",
    appointments,
    prefs: { privacyMode: integration.privacyMode, syncNonBlocking: integration.syncNonBlocking },
    now,
  })

  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": 'inline; filename="clinica.ics"',
    },
  })
}
