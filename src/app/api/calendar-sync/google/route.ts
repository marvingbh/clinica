import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { decrypt } from "@/lib/crypto"
import {
  enqueueCalendarSync,
  flushCalendarSyncAfterResponse,
  GoogleCalendarClient,
} from "@/lib/calendar-sync"

/**
 * DELETE /api/calendar-sync/google[?cleanup=true]
 * Disconnects the user's Google integration. With ?cleanup=true, enqueues a
 * DELETE per existing event link (so remote events are removed) and keeps the
 * integration in REVOGADA until those jobs drain. Without cleanup, removes the
 * integration (links cascade) and leaves the remote events in place.
 */
export const DELETE = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "WRITE" },
  async (req, { user }) => {
    const cleanup = new URL(req.url).searchParams.get("cleanup") === "true"

    const integration = await prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
    })
    if (!integration) {
      return NextResponse.json({ error: "Google não conectado" }, { status: 404 })
    }

    // Best-effort token revocation at Google.
    if (integration.encryptedRefreshToken) {
      try {
        await GoogleCalendarClient.revokeToken(decrypt(integration.encryptedRefreshToken))
      } catch {
        /* ignore */
      }
    }

    if (cleanup) {
      const links = await prisma.calendarEventLink.findMany({
        where: { integrationId: integration.id },
        select: { appointmentId: true },
      })
      const apptIds = [...new Set(links.map((l) => l.appointmentId))]
      if (apptIds.length > 0) {
        await enqueueCalendarSync(prisma, {
          clinicId: user.clinicId,
          appointmentIds: apptIds,
          operation: "DELETE",
        })
      }
      // Keep the integration (REVOGADA) so the delete jobs still resolve its
      // calendar; a follow-up disconnect without cleanup removes it.
      await prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: { status: "REVOGADA", lastErrorMessage: null },
      })
      await audit.log({
        user,
        action: AuditAction.CALENDAR_INTEGRATION_CLEANUP_REQUESTED,
        entityType: "CalendarIntegration",
        entityId: integration.id,
        request: req,
      })
      flushCalendarSyncAfterResponse()
      return NextResponse.json({ ok: true, cleanup: true })
    }

    await prisma.calendarIntegration.delete({ where: { id: integration.id } })
    await audit.log({
      user,
      action: AuditAction.CALENDAR_INTEGRATION_DISCONNECTED,
      entityType: "CalendarIntegration",
      entityId: integration.id,
      request: req,
    })
    return NextResponse.json({ ok: true })
  }
)
