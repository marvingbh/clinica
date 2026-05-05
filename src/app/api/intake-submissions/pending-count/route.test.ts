import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Pass-through the auth wrapper so we can test the handler in isolation.
vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockCount = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    intakeSubmission: { count: (...args: unknown[]) => mockCount(...args) },
  },
}))

import { GET } from "./route"

const mockUser = {
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: "prof-1",
}

function makeRequest() {
  return new NextRequest(new URL("http://localhost/api/intake-submissions/pending-count"))
}

async function callGET(user = mockUser) {
  const handler = GET as Function
  return handler(makeRequest(), { user })
}

describe("GET /api/intake-submissions/pending-count", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCount.mockResolvedValue(0)
  })

  it("returns the PENDING count for the caller's clinic", async () => {
    mockCount.mockResolvedValue(3)
    const res = await callGET()
    expect(await res.json()).toEqual({ count: 3 })
  })

  it("returns 0 when there are no pending submissions", async () => {
    mockCount.mockResolvedValue(0)
    const res = await callGET()
    expect(await res.json()).toEqual({ count: 0 })
  })

  it("scopes the count to the caller's clinicId and PENDING status", async () => {
    await callGET({ ...mockUser, clinicId: "clinic-42" })
    expect(mockCount).toHaveBeenCalledWith({
      where: { clinicId: "clinic-42", status: "PENDING" },
    })
  })

  it("never queries APPROVED or REJECTED rows", async () => {
    await callGET()
    const arg = mockCount.mock.calls[0][0]
    expect(arg.where.status).toBe("PENDING")
  })

  it("sets a private short-lived Cache-Control header", async () => {
    const res = await callGET()
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=30")
  })
})
