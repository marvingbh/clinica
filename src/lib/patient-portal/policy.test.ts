import { describe, it, expect } from "vitest"
import { canConfirmInPortal, canCancelInPortal, resolvePortalAccess } from "./policy"

describe("canConfirmInPortal", () => {
  it("allows only AGENDADO", () => {
    expect(canConfirmInPortal("AGENDADO")).toBe(true)
    expect(canConfirmInPortal("CONFIRMADO")).toBe(false)
    expect(canConfirmInPortal("FINALIZADO")).toBe(false)
    expect(canConfirmInPortal("CANCELADO_ACORDADO")).toBe(false)
  })
})

describe("canCancelInPortal", () => {
  const scheduledAt = new Date("2026-06-11T15:00:00Z")
  const minHours = 24

  it("allows cancellation comfortably within the window", () => {
    const now = new Date("2026-06-09T10:00:00Z")
    expect(canCancelInPortal({ status: "AGENDADO", scheduledAt, now, minHours })).toEqual({
      allowed: true,
    })
  })

  it("allows from CONFIRMADO too", () => {
    const now = new Date("2026-06-09T10:00:00Z")
    expect(canCancelInPortal({ status: "CONFIRMADO", scheduledAt, now, minHours })).toEqual({
      allowed: true,
    })
  })

  it("denies on the exact deadline boundary", () => {
    // deadline = scheduledAt - 24h = 2026-06-10T15:00:00Z
    const now = new Date("2026-06-10T15:00:00Z")
    expect(canCancelInPortal({ status: "AGENDADO", scheduledAt, now, minHours })).toEqual({
      allowed: false,
      reason: "window",
    })
  })

  it("allows one second before the deadline", () => {
    const now = new Date("2026-06-10T14:59:59Z")
    expect(canCancelInPortal({ status: "AGENDADO", scheduledAt, now, minHours })).toEqual({
      allowed: true,
    })
  })

  it("denies for a non-cancellable status", () => {
    const now = new Date("2026-06-09T10:00:00Z")
    expect(canCancelInPortal({ status: "FINALIZADO", scheduledAt, now, minHours })).toEqual({
      allowed: false,
      reason: "status",
    })
    expect(canCancelInPortal({ status: "CANCELADO_ACORDADO", scheduledAt, now, minHours })).toEqual({
      allowed: false,
      reason: "status",
    })
  })
})

describe("resolvePortalAccess", () => {
  const active: { subscriptionStatus: string; trialEndsAt: Date | null } = {
    subscriptionStatus: "active",
    trialEndsAt: null,
  }

  it("is disabled when the plan does not allow the portal", () => {
    expect(
      resolvePortalAccess({ planAllows: false, clinicEnabled: true, clinicActive: true, subscription: active }),
    ).toBe("disabled")
  })

  it("is disabled when the clinic toggle is off", () => {
    expect(
      resolvePortalAccess({ planAllows: true, clinicEnabled: false, clinicActive: true, subscription: active }),
    ).toBe("disabled")
  })

  it("is disabled when the clinic is inactive", () => {
    expect(
      resolvePortalAccess({ planAllows: true, clinicEnabled: true, clinicActive: false, subscription: active }),
    ).toBe("disabled")
  })

  it("is read_only when the trial has expired", () => {
    expect(
      resolvePortalAccess({
        planAllows: true,
        clinicEnabled: true,
        clinicActive: true,
        subscription: { subscriptionStatus: "trialing", trialEndsAt: new Date("2020-01-01T00:00:00Z") },
      }),
    ).toBe("read_only")
  })

  it("is read_only when canceled", () => {
    expect(
      resolvePortalAccess({
        planAllows: true,
        clinicEnabled: true,
        clinicActive: true,
        subscription: { subscriptionStatus: "canceled", trialEndsAt: null },
      }),
    ).toBe("read_only")
  })

  it("is full for past_due (full_access_warning keeps write)", () => {
    expect(
      resolvePortalAccess({
        planAllows: true,
        clinicEnabled: true,
        clinicActive: true,
        subscription: { subscriptionStatus: "past_due", trialEndsAt: null },
      }),
    ).toBe("full")
  })

  it("is full when active", () => {
    expect(
      resolvePortalAccess({ planAllows: true, clinicEnabled: true, clinicActive: true, subscription: active }),
    ).toBe("full")
  })
})
