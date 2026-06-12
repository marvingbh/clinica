import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { icsFeedUrl } from "@/lib/calendar-sync/route-helpers"

/**
 * POST /api/calendar-sync/ics
 * Creates or regenerates the read-only iCal feed token for the user's ICS
 * integration. Regenerating invalidates the previous link immediately.
 */
export const POST = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "WRITE" },
  async (req, { user }) => {
    if (!user.professionalProfileId) {
      return NextResponse.json(
        { error: "Apenas profissionais com perfil podem gerar um link iCal." },
        { status: 400 }
      )
    }

    const token = randomBytes(32).toString("hex")
    const integration = await prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId: user.id, provider: "ICS" } },
      create: { clinicId: user.clinicId, userId: user.id, provider: "ICS", icsToken: token },
      update: { icsToken: token },
    })

    await audit.log({
      user,
      action: AuditAction.CALENDAR_ICS_TOKEN_GENERATED,
      entityType: "CalendarIntegration",
      entityId: integration.id,
      request: req,
    })

    return NextResponse.json({ icsUrl: icsFeedUrl(req, token) })
  }
)

/**
 * DELETE /api/calendar-sync/ics — disables the feed (removes the ICS integration).
 */
export const DELETE = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "WRITE" },
  async (req, { user }) => {
    const integration = await prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId: user.id, provider: "ICS" } },
    })
    if (!integration) {
      return NextResponse.json({ error: "Feed iCal não encontrado" }, { status: 404 })
    }

    await prisma.calendarIntegration.delete({ where: { id: integration.id } })
    await audit.log({
      user,
      action: AuditAction.CALENDAR_ICS_TOKEN_REVOKED,
      entityType: "CalendarIntegration",
      entityId: integration.id,
      request: req,
    })

    return NextResponse.json({ ok: true })
  }
)
