import { cookies } from "next/headers"
import { portalCookieName, SESSION_ABSOLUTE_DAYS, SESSION_AGENDA_HOURS } from "./session"

/** Reads the client IP from forwarding headers. */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  )
}

/** Sets the httpOnly portal session cookie scoped to a slug. */
export async function setPortalCookie(
  slug: string,
  token: string,
  scope: "FULL" | "AGENDA",
): Promise<void> {
  const cookieStore = await cookies()
  const maxAge =
    scope === "AGENDA"
      ? SESSION_AGENDA_HOURS * 60 * 60
      : SESSION_ABSOLUTE_DAYS * 24 * 60 * 60
  cookieStore.set(portalCookieName(slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: `/paciente/${slug}`,
  })
}

/** Clears the portal session cookie for a slug. */
export async function clearPortalCookie(slug: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(portalCookieName(slug))
}
