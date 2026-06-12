import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuthentication } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { encrypt } from "@/lib/crypto"
import {
  verifyOAuthState,
  enqueueCalendarSync,
  flushCalendarSyncAfterResponse,
  GoogleCalendarClient,
} from "@/lib/calendar-sync"
import { googleRedirectUri, appBaseUrl } from "@/lib/calendar-sync/route-helpers"
import { addDays } from "../../_lib"

/**
 * GET /api/calendar-sync/google/callback
 * OAuth redirect target. Validates the signed state against the session user,
 * exchanges the code, encrypts the refresh token, upserts the integration and
 * kicks off a 90-day backfill. Redirects back to /profile.
 */
export const GET = withAuthentication(async (req, user) => {
  const base = appBaseUrl(req)
  const errorRedirect = NextResponse.redirect(`${base}/profile?calendar=erro`)

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (searchParams.get("error") || !code || !state) return errorRedirect

  const verified = verifyOAuthState(state)
  if (!verified.valid || verified.userId !== user.id || verified.clinicId !== user.clinicId) {
    return errorRedirect
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  if (!clientId || !clientSecret) return errorRedirect

  try {
    const { refreshToken, accessToken, scopes } = await GoogleCalendarClient.exchangeCode({
      clientId,
      clientSecret,
      code,
      redirectUri: googleRedirectUri(req),
    })

    const email = await GoogleCalendarClient.fetchAccountEmail(accessToken)

    const integration = await prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
      create: {
        clinicId: user.clinicId,
        userId: user.id,
        provider: "GOOGLE",
        status: "ATIVA",
        encryptedRefreshToken: refreshToken ? encrypt(refreshToken) : null,
        googleAccountEmail: email,
        grantedScopes: scopes,
      },
      update: {
        status: "ATIVA",
        lastErrorMessage: null,
        googleAccountEmail: email,
        grantedScopes: scopes,
        // Only overwrite the stored token when Google re-issued one.
        ...(refreshToken ? { encryptedRefreshToken: encrypt(refreshToken) } : {}),
      },
    })

    // Backfill: enqueue UPSERT of the next 90 days for this professional.
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
      action: AuditAction.CALENDAR_INTEGRATION_CONNECTED,
      entityType: "CalendarIntegration",
      entityId: integration.id,
      newValues: { provider: "GOOGLE", googleAccountEmail: email },
      request: req,
    })

    flushCalendarSyncAfterResponse()
    return NextResponse.redirect(`${base}/profile?calendar=conectado`)
  } catch (err) {
    console.error("[calendar-sync] google callback failed:", err)
    return errorRedirect
  }
})
