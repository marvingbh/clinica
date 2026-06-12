import { NextRequest } from "next/server"

/** App base URL for redirects and deep links (prod env, else request origin). */
export function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (env) return env.replace(/\/+$/, "")
  return new URL(req.url).origin
}

/** The Google OAuth redirect URI (env override, else derived from the app URL). */
export function googleRedirectUri(req: NextRequest): string {
  if (process.env.GOOGLE_CALENDAR_REDIRECT_URI) {
    return process.env.GOOGLE_CALENDAR_REDIRECT_URI
  }
  return `${appBaseUrl(req)}/api/calendar-sync/google/callback`
}

/** Full public ICS feed URL for a token. */
export function icsFeedUrl(req: NextRequest, token: string): string {
  return `${appBaseUrl(req)}/api/public/calendar/${token}`
}
