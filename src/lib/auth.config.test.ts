import { describe, it, expect } from "vitest"
import { authConfig } from "./auth.config"

/**
 * Exercises the `authorized` proxy/middleware callback. The key invariant:
 * cron job routes (/api/jobs/*) must pass through WITHOUT a session so that
 * Vercel Cron requests (which carry a CRON_SECRET bearer, not a session)
 * reach the route handlers instead of being redirected to /login.
 */

type AuthorizedFn = (params: {
  auth: { user?: unknown } | null
  request: { nextUrl: URL }
}) => boolean | Response

const authorized = authConfig.callbacks!.authorized as AuthorizedFn

function check(pathname: string, loggedIn: boolean) {
  return authorized({
    auth: loggedIn ? { user: { id: "u1" } } : null,
    request: { nextUrl: new URL(`https://app.example.com${pathname}`) },
  })
}

describe("authorized callback — cron routes", () => {
  it("allows /api/jobs/* through without a session", () => {
    expect(check("/api/jobs/run-daily", false)).toBe(true)
    expect(check("/api/jobs/extend-recurrences", false)).toBe(true)
    expect(check("/api/jobs/send-reminders", false)).toBe(true)
  })
})

describe("authorized callback — other routes", () => {
  it("blocks protected routes when not logged in", () => {
    expect(check("/agenda", false)).toBe(false)
    expect(check("/api/appointments", false)).toBe(false)
  })

  it("allows protected routes when logged in", () => {
    expect(check("/agenda", true)).toBe(true)
    expect(check("/api/appointments", true)).toBe(true)
  })

  it("keeps existing public routes open without a session", () => {
    expect(check("/login", false)).toBe(true)
    expect(check("/api/public/plans", false)).toBe(true)
    expect(check("/api/webhooks/stripe", false)).toBe(true)
  })
})
