import { describe, it, expect, afterEach } from "vitest"
import { verifyCronAuth } from "./verify-cron"

function reqWith(authHeader?: string): Request {
  return new Request("https://example.com/api/jobs/x", {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

const ORIGINAL = process.env.CRON_SECRET

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL
})

describe("verifyCronAuth", () => {
  it("accepts a matching Bearer secret", () => {
    process.env.CRON_SECRET = "s3cret"
    expect(verifyCronAuth(reqWith("Bearer s3cret"))).toBe(true)
  })

  it("rejects a wrong secret", () => {
    process.env.CRON_SECRET = "s3cret"
    expect(verifyCronAuth(reqWith("Bearer nope"))).toBe(false)
  })

  it("rejects a missing header", () => {
    process.env.CRON_SECRET = "s3cret"
    expect(verifyCronAuth(reqWith())).toBe(false)
  })

  it("fails closed when CRON_SECRET is unset (no 'Bearer undefined' bypass)", () => {
    delete process.env.CRON_SECRET
    expect(verifyCronAuth(reqWith("Bearer undefined"))).toBe(false)
    expect(verifyCronAuth(reqWith("Bearer "))).toBe(false)
    expect(verifyCronAuth(reqWith())).toBe(false)
  })
})
