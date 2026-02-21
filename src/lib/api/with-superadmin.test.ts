import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// Mock getSuperAdminSession
const mockGetSession = vi.fn()
vi.mock("@/lib/superadmin-auth", () => ({
  getSuperAdminSession: () => mockGetSession(),
}))

import { withSuperAdmin } from "./with-superadmin"
import type { SuperAdminSession } from "@/lib/superadmin-auth"

describe("withSuperAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const testAdmin: SuperAdminSession = {
    id: "sa_1",
    email: "admin@platform.com",
    name: "Platform Admin",
  }

  function makeRequest(url = "http://localhost/api/superadmin/test") {
    return new NextRequest(url)
  }

  it("returns 401 when no session exists", async () => {
    mockGetSession.mockResolvedValue(null)

    const handler = vi.fn()
    const wrapped = withSuperAdmin(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Super admin authentication required")
    expect(handler).not.toHaveBeenCalled()
  })

  it("calls handler with session when authenticated", async () => {
    mockGetSession.mockResolvedValue(testAdmin)

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withSuperAdmin(handler)
    const req = makeRequest()
    await wrapped(req)

    expect(handler).toHaveBeenCalledWith(req, testAdmin, {})
  })

  it("passes route params to handler", async () => {
    mockGetSession.mockResolvedValue(testAdmin)

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withSuperAdmin(handler)
    const req = makeRequest()
    const routeContext = { params: Promise.resolve({ id: "clinic_123" }) }

    await wrapped(req, routeContext)

    expect(handler).toHaveBeenCalledWith(req, testAdmin, { id: "clinic_123" })
  })

  it("passes empty params when routeContext is undefined", async () => {
    mockGetSession.mockResolvedValue(testAdmin)

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true })
    )
    const wrapped = withSuperAdmin(handler)
    await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledWith(
      expect.any(NextRequest),
      testAdmin,
      {}
    )
  })

  it("returns the handler response on success", async () => {
    mockGetSession.mockResolvedValue(testAdmin)

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ clinics: [1, 2, 3] }, { status: 200 })
    )
    const wrapped = withSuperAdmin(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.clinics).toEqual([1, 2, 3])
  })
})
