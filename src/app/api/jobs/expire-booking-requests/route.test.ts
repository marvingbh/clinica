import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookingRequest: { updateMany: vi.fn() },
  },
}))

import { GET } from "./route"
import { prisma } from "@/lib/prisma"

const mockUpdateMany = vi.mocked(prisma.bookingRequest.updateMany)

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`
  return new Request("http://localhost/api/jobs/expire-booking-requests", { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "test-secret"
})

describe("GET /api/jobs/expire-booking-requests", () => {
  it("rejects requests without the cron secret", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("rejects requests with the wrong cron secret", async () => {
    const res = await GET(makeRequest("wrong"))
    expect(res.status).toBe(401)
  })

  it("expires PENDING requests whose slot is in the past", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 3 })
    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expired).toBe(3)
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)

    const arg = mockUpdateMany.mock.calls[0][0] as {
      where: { status: string; scheduledAt: { lt: Date } }
      data: { status: string }
    }
    expect(arg.where.status).toBe("PENDING")
    // Only past slots are targeted.
    expect(arg.where.scheduledAt).toHaveProperty("lt")
    expect(arg.where.scheduledAt.lt).toBeInstanceOf(Date)
    expect(arg.data.status).toBe("EXPIRED")
  })

  it("leaves future PENDING requests untouched (only lt now is matched)", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })
    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()
    expect(body.expired).toBe(0)
    // The query only ever filters scheduledAt < now, so future rows are never in scope.
    const arg = mockUpdateMany.mock.calls[0][0] as {
      where: { scheduledAt: { lt: Date } }
    }
    const cutoff = arg.where.scheduledAt.lt
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now())
  })
})
