import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockFindMany = vi.fn()
const mockGroupFindMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointmentRecurrence: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    therapyGroup: { findMany: (...args: unknown[]) => mockGroupFindMany(...args) },
  },
}))

import { GET } from "./route"

function makeUser(overrides: { permissions?: Record<string, string>; professionalProfileId?: string | null } = {}) {
  return {
    id: "user-1",
    clinicId: "clinic-1",
    role: "ADMIN" as const,
    professionalProfileId: overrides.professionalProfileId ?? "self-prof",
    permissions: overrides.permissions ?? { agenda_own: "READ", agenda_others: "READ" },
  }
}

function makeRequest(query = "") {
  const url = new URL(`http://localhost/api/appointments/recurrences/slots${query}`)
  return new NextRequest(url)
}

async function callGET(query = "", user = makeUser()) {
  const handler = GET as unknown as (req: NextRequest, ctx: { user: ReturnType<typeof makeUser> }) => Promise<Response>
  return handler(makeRequest(query), { user })
}

describe("GET /api/appointments/recurrences/slots", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([])
    mockGroupFindMany.mockResolvedValue([])
  })

  it("scopes to the caller's clinicId, active, weekly/biweekly/monthly only", async () => {
    await callGET()
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.clinicId).toBe("clinic-1")
    expect(where.isActive).toBe(true)
    expect(where.recurrenceType).toEqual({ in: ["WEEKLY", "BIWEEKLY", "MONTHLY"] })
  })

  it("excludes NOTA and LEMBRETE (non-blocking) appointment types", async () => {
    await callGET()
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.type).toEqual({ in: ["CONSULTA", "REUNIAO", "TAREFA"] })
  })

  it("filters out recurrences whose endDate has passed", async () => {
    await callGET()
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.OR).toEqual([
      { endDate: null },
      { endDate: { gte: expect.any(Date) } },
    ])
    // boundary is start-of-day today
    const boundary = where.OR[1].endDate.gte as Date
    expect(boundary.getHours()).toBe(0)
    expect(boundary.getMinutes()).toBe(0)
    expect(boundary.getSeconds()).toBe(0)
  })

  it("when agenda_others=READ and no param, returns all clinic recurrences (no prof filter)", async () => {
    await callGET()
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.AND).toBeUndefined()
  })

  it("when agenda_others=READ and param given, ORs against professionalProfileId and additional pros", async () => {
    await callGET("?professionalProfileId=target-prof")
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.AND).toEqual([
      {
        OR: [
          { professionalProfileId: "target-prof" },
          {
            additionalProfessionals: {
              some: { professionalProfileId: "target-prof" },
            },
          },
        ],
      },
    ])
  })

  it("when agenda_others=NONE, forces filter to caller's own professionalProfileId regardless of param", async () => {
    const user = makeUser({
      permissions: { agenda_own: "READ", agenda_others: "NONE" },
      professionalProfileId: "caller-prof",
    })
    await callGET("?professionalProfileId=somebody-else", user)
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.AND).toEqual([
      {
        OR: [
          { professionalProfileId: "caller-prof" },
          {
            additionalProfessionals: {
              some: { professionalProfileId: "caller-prof" },
            },
          },
        ],
      },
    ])
  })

  it("selects patient, professional, and additionalProfessionals", async () => {
    await callGET()
    const select = mockFindMany.mock.calls[0][0].select
    expect(select.patient).toEqual({ select: { id: true, name: true } })
    expect(select.professionalProfile).toEqual({
      select: { user: { select: { name: true } } },
    })
    expect(select.additionalProfessionals).toBeDefined()
  })

  it("orders by dayOfWeek then startTime", async () => {
    await callGET()
    const orderBy = mockFindMany.mock.calls[0][0].orderBy
    expect(orderBy).toEqual([{ dayOfWeek: "asc" }, { startTime: "asc" }])
  })

  it("returns { recurrences } payload", async () => {
    mockFindMany.mockResolvedValue([
      { id: "r1", dayOfWeek: 1, startTime: "08:00", startDate: new Date("2026-03-03"), appointments: [] },
    ])
    const res = await callGET()
    const body = await res.json()
    expect(body.recurrences).toHaveLength(1)
    expect(body.recurrences[0].id).toBe("r1")
  })

  it("only surfaces recurrences with at least one future appointment", async () => {
    await callGET()
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.appointments).toEqual({ some: { scheduledAt: { gte: expect.any(Date) } } })
  })

  it("requests the earliest future appointment per recurrence as the anchor", async () => {
    await callGET()
    const select = mockFindMany.mock.calls[0][0].select
    expect(select.appointments).toEqual({
      where: { scheduledAt: { gte: expect.any(Date) } },
      orderBy: { scheduledAt: "asc" },
      take: 1,
      select: { scheduledAt: true },
    })
  })

  it("rewrites startDate in the response to the next upcoming appointment's date", async () => {
    // Recurrence's stored startDate is March 3 (e.g. ISO week 10 = par), but
    // appointments have since been swapped — the actual next session is on
    // May 26 (ISO week 22 = par). After the rewrite the frontend computes
    // parity from May 26 instead of March 3.
    mockFindMany.mockResolvedValue([
      {
        id: "r-ana",
        startDate: new Date("2026-03-03T00:00:00Z"),
        dayOfWeek: 2,
        startTime: "14:45",
        appointments: [{ scheduledAt: new Date("2026-05-26T17:45:00Z") }],
      },
    ])
    const res = await callGET()
    const body = await res.json()
    expect(body.recurrences[0].startDate).toEqual("2026-05-26T17:45:00.000Z")
    // The raw `appointments` field is stripped so the frontend never sees it.
    expect(body.recurrences[0].appointments).toBeUndefined()
  })

  it("falls back to the original startDate when no future appointment exists in the join", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "r-empty",
        startDate: new Date("2026-03-03T00:00:00Z"),
        appointments: [],
      },
    ])
    const res = await callGET()
    const body = await res.json()
    expect(body.recurrences[0].startDate).toEqual("2026-03-03T00:00:00.000Z")
  })
})
