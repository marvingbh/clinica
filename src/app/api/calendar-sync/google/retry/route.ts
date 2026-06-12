import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { enqueueCalendarSync, flushCalendarSyncAfterResponse } from "@/lib/calendar-sync"
import { addDays } from "../../_lib"

/**
 * POST /api/calendar-sync/google/retry
 * "Tentar novamente": resets the integration to ATIVA and re-enqueues a 90-day
 * backfill. Used after an ERRO/REVOGADA badge (a reconnect may also be needed).
 */
export const POST = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "WRITE" },
  async (_req, { user }) => {
    const integration = await prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
    })
    if (!integration) {
      return NextResponse.json({ error: "Google não conectado" }, { status: 404 })
    }

    await prisma.calendarIntegration.update({
      where: { id: integration.id },
      data: { status: "ATIVA", lastErrorMessage: null },
    })

    if (user.professionalProfileId) {
      const upcoming = await prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          professionalProfileId: user.professionalProfileId,
          scheduledAt: { gte: new Date(), lte: addDays(new Date(), 90) },
        },
        select: { id: true },
      })
      if (upcoming.length > 0) {
        await enqueueCalendarSync(prisma, {
          clinicId: user.clinicId,
          appointmentIds: upcoming.map((a) => a.id),
          operation: "UPSERT",
        })
      }
    }

    await audit.log({
      user,
      action: AuditAction.CALENDAR_INTEGRATION_RETRY,
      entityType: "CalendarIntegration",
      entityId: integration.id,
      request: _req,
    })

    flushCalendarSyncAfterResponse()
    return NextResponse.json({ ok: true })
  }
)
