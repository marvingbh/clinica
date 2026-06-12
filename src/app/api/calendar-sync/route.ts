import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import {
  enqueueCalendarSync,
  flushCalendarSyncAfterResponse,
  signOAuthState,
  buildGoogleAuthUrl,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from "@/lib/calendar-sync"
import { icsFeedUrl, googleRedirectUri } from "@/lib/calendar-sync/route-helpers"
import { addDays } from "./_lib"

/**
 * GET /api/calendar-sync — the session user's calendar integrations (GOOGLE + ICS).
 * Self-scoped by userId + clinicId; nothing comes from the request body.
 */
export const GET = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "READ" },
  async (req, { user }) => {
    const integrations = await prisma.calendarIntegration.findMany({
      where: { userId: user.id, clinicId: user.clinicId },
    })

    const google = integrations.find((i) => i.provider === "GOOGLE")
    const ics = integrations.find((i) => i.provider === "ICS")

    return NextResponse.json({
      hasProfessionalProfile: user.professionalProfileId !== null,
      google: google
        ? {
            status: google.status,
            googleAccountEmail: google.googleAccountEmail,
            privacyMode: google.privacyMode,
            targetCalendarId: google.targetCalendarId,
            syncNonBlocking: google.syncNonBlocking,
            inboundEnabled: google.inboundEnabled,
            selectedCalendarIds: google.selectedCalendarIds,
            lastSyncAt: google.lastSyncAt,
            lastErrorMessage: google.lastErrorMessage,
          }
        : null,
      ics: ics?.icsToken
        ? {
            privacyMode: ics.privacyMode,
            syncNonBlocking: ics.syncNonBlocking,
            icsUrl: icsFeedUrl(req, ics.icsToken),
          }
        : null,
    })
  }
)

const patchSchema = z.object({
  provider: z.enum(["GOOGLE", "ICS"]),
  privacyMode: z.enum(["TOTAL", "PRIMEIRO_NOME"]).optional(),
  syncNonBlocking: z.boolean().optional(),
  targetCalendarId: z.string().min(1).optional(),
  inboundEnabled: z.boolean().optional(),
  selectedCalendarIds: z.array(z.string()).optional(),
})

/**
 * PATCH /api/calendar-sync — update preferences on the user's own integration.
 * A privacyMode change re-enqueues UPSERT of the next 90 days so existing
 * events get re-titled.
 */
export const PATCH = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "WRITE" },
  async (req, { user }) => {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 })
    }
    const { provider, ...changes } = parsed.data

    const integration = await prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId: user.id, provider } },
    })
    if (!integration) {
      return NextResponse.json({ error: "Integração não encontrada" }, { status: 404 })
    }

    const old = {
      privacyMode: integration.privacyMode,
      targetCalendarId: integration.targetCalendarId,
      syncNonBlocking: integration.syncNonBlocking,
      inboundEnabled: integration.inboundEnabled,
    }

    // Phase 2 incremental consent: enabling inbound needs the readonly
    // (freeBusy) scope. If it isn't granted yet, ask the user to re-authorize
    // before we flip the flag.
    const enablingInbound = changes.inboundEnabled === true && !old.inboundEnabled
    if (
      enablingInbound &&
      provider === "GOOGLE" &&
      !integration.grantedScopes.includes(GOOGLE_CALENDAR_READONLY_SCOPE)
    ) {
      const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
      if (clientId) {
        const state = signOAuthState(user.id, user.clinicId, Date.now())
        const authUrl = buildGoogleAuthUrl({
          clientId,
          redirectUri: googleRedirectUri(req),
          state,
          includeFreeBusyScope: true,
        })
        return NextResponse.json({ needsReconsent: true, authUrl })
      }
    }

    await prisma.calendarIntegration.update({
      where: { id: integration.id },
      data: {
        privacyMode: changes.privacyMode ?? undefined,
        syncNonBlocking: changes.syncNonBlocking ?? undefined,
        targetCalendarId: changes.targetCalendarId ?? undefined,
        inboundEnabled: changes.inboundEnabled ?? undefined,
        selectedCalendarIds: changes.selectedCalendarIds ?? undefined,
      },
    })

    // Re-title existing events when privacy mode changes.
    const privacyChanged = changes.privacyMode && changes.privacyMode !== old.privacyMode
    if (privacyChanged && user.professionalProfileId) {
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
      action: AuditAction.CALENDAR_INTEGRATION_UPDATED,
      entityType: "CalendarIntegration",
      entityId: integration.id,
      oldValues: old,
      newValues: changes,
      request: req,
    })

    if (privacyChanged) flushCalendarSyncAfterResponse()
    return NextResponse.json({ ok: true })
  }
)
