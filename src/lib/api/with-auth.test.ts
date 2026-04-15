import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// Mock next-auth session
const mockAuth = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}))

// Mock prisma for subscription checks
const mockPrismaClinicFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: { findUnique: (...args: unknown[]) => mockPrismaClinicFindUnique(...args) },
    auditLog: { create: vi.fn() },
  },
}))

import { withAuth, withAuthentication, withFeatureAuth } from "./with-auth"
import type { AuthUser } from "@/lib/rbac"
import type { ResolvedPermissions } from "@/lib/rbac/types"

// --- Helpers ---

function makeRequest(
  url = "http://localhost/api/test",
  method = "GET"
) {
  return new NextRequest(url, { method })
}

const adminPermissions: ResolvedPermissions = {
  agenda_own: "WRITE",
  agenda_others: "WRITE",
  patients: "WRITE",
  groups: "WRITE",
  users: "WRITE",
  clinic_settings: "WRITE",
  professionals: "WRITE",
  notifications: "WRITE",
  audit_logs: "READ",
  availability_own: "WRITE",
  availability_others: "WRITE",
  finances: "WRITE",
  expenses: "WRITE",
}

const professionalPermissions: ResolvedPermissions = {
  agenda_own: "WRITE",
  agenda_others: "NONE",
  patients: "READ",
  groups: "WRITE",
  users: "NONE",
  clinic_settings: "NONE",
  professionals: "NONE",
  notifications: "NONE",
  audit_logs: "NONE",
  availability_own: "WRITE",
  availability_others: "NONE",
  finances: "WRITE",
  expenses: "NONE",
}

function makeAdminSession() {
  return {
    user: {
      id: "user-1",
      clinicId: "clinic-1",
      role: "ADMIN",
      professionalProfileId: "prof-1",
      permissions: adminPermissions,
    },
  }
}

function makeProfessionalSession() {
  return {
    user: {
      id: "user-2",
      clinicId: "clinic-1",
      role: "PROFESSIONAL",
      professionalProfileId: "prof-2",
      permissions: professionalPermissions,
    },
  }
}

/** Simulate an active subscription so subscription checks don't block. */
function mockActiveSubscription() {
  mockPrismaClinicFindUnique.mockResolvedValue({
    subscriptionStatus: "active",
    trialEndsAt: null,
  })
}

describe("withAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveSubscription()
  })

  it("returns 401 when no session exists", async () => {
    mockAuth.mockResolvedValue(null)

    const handler = vi.fn()
    const wrapped = withAuth(
      { resource: "appointment", action: "read" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 401 when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null })

    const handler = vi.fn()
    const wrapped = withAuth(
      { resource: "appointment", action: "read" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 403 when role lacks permission for the resource/action", async () => {
    mockAuth.mockResolvedValue(makeProfessionalSession())

    const handler = vi.fn()
    const wrapped = withAuth(
      { resource: "user", action: "create" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("Forbidden")
    expect(handler).not.toHaveBeenCalled()
  })

  it("calls handler with user and scope when admin has permission", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withAuth(
      { resource: "appointment", action: "read" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)

    const [, context] = handler.mock.calls[0]
    expect(context.user.role).toBe("ADMIN")
    expect(context.scope).toBe("clinic")
  })

  it("returns own scope for professional on appointment read", async () => {
    mockAuth.mockResolvedValue(makeProfessionalSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withAuth(
      { resource: "appointment", action: "read" },
      handler
    )
    await wrapped(makeRequest())

    const [, context] = handler.mock.calls[0]
    expect(context.scope).toBe("own")
  })

  it("resolves and passes route params to handler", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withAuth(
      { resource: "appointment", action: "read" },
      handler
    )
    const routeContext = { params: Promise.resolve({ id: "appt-123" }) }

    await wrapped(makeRequest(), routeContext)

    const [, , params] = handler.mock.calls[0]
    expect(params).toEqual({ id: "appt-123" })
  })

  it("passes empty params when routeContext is undefined", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withAuth(
      { resource: "appointment", action: "read" },
      handler
    )
    await wrapped(makeRequest())

    const [, , params] = handler.mock.calls[0]
    expect(params).toEqual({})
  })

  it("blocks mutation when subscription is read-only", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())
    mockPrismaClinicFindUnique.mockResolvedValue({
      subscriptionStatus: "canceled",
      trialEndsAt: null,
    })

    const handler = vi.fn()
    const wrapped = withAuth(
      { resource: "appointment", action: "create" },
      handler
    )
    const res = await wrapped(makeRequest("http://localhost/api/test", "POST"))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("Subscription required")
    expect(handler).not.toHaveBeenCalled()
  })

  it("allows GET requests even with read-only subscription", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())
    mockPrismaClinicFindUnique.mockResolvedValue({
      subscriptionStatus: "canceled",
      trialEndsAt: null,
    })

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withAuth(
      { resource: "appointment", action: "read" },
      handler
    )
    const res = await wrapped(makeRequest("http://localhost/api/test", "GET"))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("returns 403 when resource belongs to a different clinic", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())

    const handler = vi.fn()
    const wrapped = withAuth(
      {
        resource: "appointment",
        action: "read",
        getResourceClinicId: () => "clinic-other",
      },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 403 when professional accesses another's resource via getResourceOwnerId", async () => {
    mockAuth.mockResolvedValue(makeProfessionalSession())

    const handler = vi.fn()
    const wrapped = withAuth(
      {
        resource: "appointment",
        action: "read",
        getResourceOwnerId: () => "prof-other",
      },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it("allows when professional accesses own resource via getResourceOwnerId", async () => {
    mockAuth.mockResolvedValue(makeProfessionalSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withAuth(
      {
        resource: "appointment",
        action: "read",
        getResourceOwnerId: () => "prof-2",
      },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe("withAuthentication", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveSubscription()
  })

  it("returns 401 when no session exists", async () => {
    mockAuth.mockResolvedValue(null)

    const handler = vi.fn()
    const wrapped = withAuthentication(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("calls handler with user when session is valid (no permission check)", async () => {
    mockAuth.mockResolvedValue(makeProfessionalSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withAuthentication(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)

    const [, user] = handler.mock.calls[0]
    expect(user.id).toBe("user-2")
    expect(user.clinicId).toBe("clinic-1")
    expect(user.role).toBe("PROFESSIONAL")
  })

  it("blocks mutation when subscription is read-only", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())
    mockPrismaClinicFindUnique.mockResolvedValue({
      subscriptionStatus: "canceled",
      trialEndsAt: null,
    })

    const handler = vi.fn()
    const wrapped = withAuthentication(handler)
    const res = await wrapped(
      makeRequest("http://localhost/api/test", "POST")
    )

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe("withFeatureAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveSubscription()
  })

  it("returns 401 when no session exists", async () => {
    mockAuth.mockResolvedValue(null)

    const handler = vi.fn()
    const wrapped = withFeatureAuth(
      { feature: "finances", minAccess: "READ" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 403 when user lacks required access level", async () => {
    mockAuth.mockResolvedValue(makeProfessionalSession())

    const handler = vi.fn()
    const wrapped = withFeatureAuth(
      { feature: "audit_logs", minAccess: "READ" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toContain("audit_logs")
    expect(handler).not.toHaveBeenCalled()
  })

  it("calls handler when user meets minimum access", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withFeatureAuth(
      { feature: "finances", minAccess: "WRITE" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)

    const [, context] = handler.mock.calls[0]
    expect(context.access).toBe("WRITE")
    expect(context.user.role).toBe("ADMIN")
  })

  it("allows READ when user has WRITE access (WRITE > READ)", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withFeatureAuth(
      { feature: "finances", minAccess: "READ" },
      handler
    )
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("blocks mutation when subscription is read-only", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())
    mockPrismaClinicFindUnique.mockResolvedValue({
      subscriptionStatus: "canceled",
      trialEndsAt: null,
    })

    const handler = vi.fn()
    const wrapped = withFeatureAuth(
      { feature: "finances", minAccess: "READ" },
      handler
    )
    const res = await wrapped(
      makeRequest("http://localhost/api/test", "POST")
    )

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it("resolves and passes route params to handler", async () => {
    mockAuth.mockResolvedValue(makeAdminSession())

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withFeatureAuth(
      { feature: "finances", minAccess: "READ" },
      handler
    )
    const routeContext = { params: Promise.resolve({ invoiceId: "inv-1" }) }

    await wrapped(makeRequest(), routeContext)

    const [, , params] = handler.mock.calls[0]
    expect(params).toEqual({ invoiceId: "inv-1" })
  })
})
