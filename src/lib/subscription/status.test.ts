import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  getSubscriptionAccess,
  isReadOnly,
  canMutate,
  getSubscriptionBanner,
  type SubscriptionInfo,
} from "./status"

describe("getSubscriptionAccess", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"))
  })
  afterEach(() => { vi.useRealTimers() })

  it("returns full_access for active subscription", () => {
    expect(getSubscriptionAccess({ subscriptionStatus: "active", trialEndsAt: null })).toBe("full_access")
  })
  it("returns full_access for trialing with future expiry", () => {
    expect(getSubscriptionAccess({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-03-15T00:00:00Z") })).toBe("full_access")
  })
  it("returns read_only for trialing with expired trial", () => {
    expect(getSubscriptionAccess({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-02-28T00:00:00Z") })).toBe("read_only")
  })
  it("returns full_access_warning for past_due", () => {
    expect(getSubscriptionAccess({ subscriptionStatus: "past_due", trialEndsAt: null })).toBe("full_access_warning")
  })
  it("returns read_only for canceled", () => {
    expect(getSubscriptionAccess({ subscriptionStatus: "canceled", trialEndsAt: null })).toBe("read_only")
  })
  it("returns read_only for unpaid", () => {
    expect(getSubscriptionAccess({ subscriptionStatus: "unpaid", trialEndsAt: null })).toBe("read_only")
  })
  it("returns read_only for trialing with null trialEndsAt", () => {
    expect(getSubscriptionAccess({ subscriptionStatus: "trialing", trialEndsAt: null })).toBe("read_only")
  })
})

describe("isReadOnly", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-01T12:00:00Z")) })
  afterEach(() => { vi.useRealTimers() })

  it("returns false for active", () => {
    expect(isReadOnly({ subscriptionStatus: "active", trialEndsAt: null })).toBe(false)
  })
  it("returns true for expired trial", () => {
    expect(isReadOnly({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-02-28T00:00:00Z") })).toBe(true)
  })
  it("returns true for canceled", () => {
    expect(isReadOnly({ subscriptionStatus: "canceled", trialEndsAt: null })).toBe(true)
  })
})

describe("canMutate", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-01T12:00:00Z")) })
  afterEach(() => { vi.useRealTimers() })

  it("returns true for active", () => {
    expect(canMutate({ subscriptionStatus: "active", trialEndsAt: null })).toBe(true)
  })
  it("returns false for expired trial", () => {
    expect(canMutate({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-02-28T00:00:00Z") })).toBe(false)
  })
  it("returns true for past_due", () => {
    expect(canMutate({ subscriptionStatus: "past_due", trialEndsAt: null })).toBe(true)
  })
})

describe("getSubscriptionBanner", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-01T12:00:00Z")) })
  afterEach(() => { vi.useRealTimers() })

  it("returns null for active", () => {
    expect(getSubscriptionBanner({ subscriptionStatus: "active", trialEndsAt: null })).toBeNull()
  })
  it("returns trial banner with days remaining", () => {
    const banner = getSubscriptionBanner({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-03-10T00:00:00Z") })
    expect(banner).not.toBeNull()
    expect(banner!.type).toBe("info")
    expect(banner!.message).toContain("9 dias")
  })
  it("returns expired trial banner", () => {
    const banner = getSubscriptionBanner({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-02-28T00:00:00Z") })
    expect(banner!.type).toBe("error")
    expect(banner!.message).toContain("expirou")
  })
  it("returns past_due warning", () => {
    const banner = getSubscriptionBanner({ subscriptionStatus: "past_due", trialEndsAt: null })
    expect(banner!.type).toBe("warning")
  })
  it("returns canceled banner", () => {
    const banner = getSubscriptionBanner({ subscriptionStatus: "canceled", trialEndsAt: null })
    expect(banner!.type).toBe("error")
  })
})
