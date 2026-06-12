import { NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { signOAuthState, buildGoogleAuthUrl } from "@/lib/calendar-sync"
import { googleRedirectUri } from "@/lib/calendar-sync/route-helpers"

/**
 * POST /api/calendar-sync/google/connect
 * Returns the Google OAuth consent URL. Requires a professional profile (only
 * professionals have appointments to sync). State is HMAC-signed and bound to
 * the session user + clinic.
 */
export const POST = withFeatureAuth(
  { feature: "calendar_sync", minAccess: "WRITE" },
  async (req, { user }) => {
    if (!user.professionalProfileId) {
      return NextResponse.json(
        { error: "Apenas profissionais com perfil podem conectar uma agenda." },
        { status: 400 }
      )
    }

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
    if (!clientId) {
      return NextResponse.json(
        { error: "Integração com Google não está configurada." },
        { status: 503 }
      )
    }

    const state = signOAuthState(user.id, user.clinicId, Date.now())
    const authUrl = buildGoogleAuthUrl({
      clientId,
      redirectUri: googleRedirectUri(req),
      state,
      includeFreeBusyScope: false,
    })

    return NextResponse.json({ authUrl })
  }
)
