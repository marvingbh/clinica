import { NextResponse } from "next/server"

/**
 * Authenticate a request from the trusted scheduler (Vercel Cron) via the
 * `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Fails CLOSED: if CRON_SECRET is not configured, every request is rejected.
 * (Some jobs previously compared against `Bearer ${process.env.CRON_SECRET}`
 * without checking the secret was set — so an unset secret turned into the
 * literal "Bearer undefined", which an attacker could send to pass.)
 */
export function verifyCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get("authorization") === `Bearer ${secret}`
}

export function cronUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
