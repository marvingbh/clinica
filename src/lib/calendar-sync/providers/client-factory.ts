import { decrypt } from "@/lib/crypto"
import type { CalendarClient } from "../types"
import { GoogleCalendarClient } from "./google-calendar-client"
import { GoogleCalendarMockClient } from "./google-calendar-mock"

/** True when the real Google provider is configured (otherwise use the mock). */
export function isGoogleProviderEnabled(): boolean {
  return (
    process.env.CALENDAR_SYNC_PROVIDER === "google" &&
    !!process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    !!process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  )
}

/**
 * Builds a CalendarClient for an integration. In dev (default) or when Google
 * is not configured, returns the mock. Otherwise decrypts the stored refresh
 * token and returns a live REST client.
 */
export function buildCalendarClient(integration: {
  encryptedRefreshToken: string | null
}): CalendarClient {
  if (!isGoogleProviderEnabled() || !integration.encryptedRefreshToken) {
    return new GoogleCalendarMockClient()
  }
  return new GoogleCalendarClient({
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
    refreshToken: decrypt(integration.encryptedRefreshToken),
  })
}
