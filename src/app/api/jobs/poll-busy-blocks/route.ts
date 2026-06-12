import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  buildCalendarClient,
  mergeBusyIntervals,
  clampToHorizon,
  CalendarAuthError,
} from "@/lib/calendar-sync"

/**
 * GET /api/jobs/poll-busy-blocks
 * Vercel Cron (every 30 min). For each ATIVA integration with inboundEnabled,
 * fetches freeBusy over a 30-day horizon for the selected calendars, merges the
 * intervals, and replaces the integration's BusyBlocks (delete + insert). A
 * 401 marks the integration REVOGADA. Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const results = { integrationsProcessed: 0, blocksWritten: 0, revoked: 0, errors: 0 }

  const integrations = await prisma.calendarIntegration.findMany({
    where: { provider: "GOOGLE", status: "ATIVA", inboundEnabled: true },
    include: { user: { select: { professionalProfile: { select: { id: true } } } } },
  })

  const now = new Date()
  const horizonEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  for (const integration of integrations) {
    const professionalProfileId = integration.user.professionalProfile?.id
    if (!professionalProfileId) continue

    const calendarIds =
      integration.selectedCalendarIds.length > 0
        ? integration.selectedCalendarIds
        : [integration.targetCalendarId || "primary"]

    try {
      const client = buildCalendarClient(integration)
      const raw = await client.freeBusy(calendarIds, now, horizonEnd)
      const merged = clampToHorizon(mergeBusyIntervals(raw), now, horizonEnd)

      await prisma.$transaction(async (tx) => {
        await tx.busyBlock.deleteMany({ where: { integrationId: integration.id } })
        if (merged.length > 0) {
          await tx.busyBlock.createMany({
            data: merged.map((m) => ({
              clinicId: integration.clinicId,
              integrationId: integration.id,
              professionalProfileId,
              startAt: m.start,
              endAt: m.end,
              sourceCalendarId: calendarIds[0],
            })),
          })
        }
        await tx.calendarIntegration.update({
          where: { id: integration.id },
          data: { busyBlocksFetchedAt: new Date() },
        })
      })

      results.integrationsProcessed++
      results.blocksWritten += merged.length
    } catch (err) {
      if (err instanceof CalendarAuthError) {
        await prisma.calendarIntegration.update({
          where: { id: integration.id },
          data: { status: "REVOGADA", lastErrorMessage: "Acesso ao Google revogado" },
        })
        results.revoked++
      } else {
        results.errors++
        console.error("[poll-busy-blocks] error:", err)
      }
    }
  }

  return NextResponse.json({ success: true, executionTimeMs: Date.now() - startTime, ...results })
}

export { GET as POST }
