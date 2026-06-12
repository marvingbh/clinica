import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { buildCalendarClient, CalendarAuthError } from "@/lib/calendar-sync"

/**
 * GET /api/calendar-sync/google/calendars
 * Proxies the user's Google calendar list for the destination-calendar select.
 */
export const GET = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "READ" },
  async (_req, { user }) => {
    const integration = await prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
    })
    if (!integration) {
      return NextResponse.json({ error: "Google não conectado" }, { status: 404 })
    }

    try {
      const client = buildCalendarClient(integration)
      const calendars = await client.listCalendars()
      return NextResponse.json({ calendars })
    } catch (err) {
      if (err instanceof CalendarAuthError) {
        await prisma.calendarIntegration.update({
          where: { id: integration.id },
          data: { status: "REVOGADA" },
        })
        return NextResponse.json({ error: "Acesso ao Google revogado" }, { status: 401 })
      }
      return NextResponse.json({ error: "Falha ao listar calendários" }, { status: 502 })
    }
  }
)
