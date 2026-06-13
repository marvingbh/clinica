import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockPrisma, mockProvider } = vi.hoisted(() => {
  const mp = {
    patientDocument: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  }
  const provider = {
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    put: vi.fn(),
    head: vi.fn(),
    getDownloadStream: vi.fn(),
  }
  return { mockPrisma: mp, mockProvider: provider }
})

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/storage/server", () => ({
  getStorageProvider: () => mockProvider,
}))

import { GET } from "./route"

const CRON_SECRET = "test-cron-secret"

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (secret !== undefined) headers["authorization"] = `Bearer ${secret}`
  return new Request("http://localhost/api/jobs/cleanup-documents", { headers })
}

const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  mockPrisma.patientDocument.groupBy.mockResolvedValue([])
  mockPrisma.patientDocument.findMany.mockResolvedValue([])
  mockPrisma.patientDocument.delete.mockResolvedValue({})
  mockProvider.list.mockResolvedValue([])
  mockProvider.delete.mockResolvedValue(undefined)
})

describe("GET /api/jobs/cleanup-documents — auth", () => {
  it("returns 401 without the cron secret header", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(mockPrisma.patientDocument.groupBy).not.toHaveBeenCalled()
  })

  it("returns 401 with the wrong secret", async () => {
    const res = await GET(makeRequest("nope"))
    expect(res.status).toBe(401)
  })
})

describe("GET /api/jobs/cleanup-documents — purge", () => {
  it("deletes the blob before the row for eligible trashed documents", async () => {
    const oldDeletedAt = new Date(Date.now() - 40 * DAY_MS)
    mockPrisma.patientDocument.groupBy.mockResolvedValue([{ clinicId: "c1" }])
    // First findMany = trashed docs; second findMany = known keys (orphan step).
    mockPrisma.patientDocument.findMany
      .mockResolvedValueOnce([
        { id: "d1", storageKey: "clinics/c1/patients/p1/d1-x.pdf", deletedAt: oldDeletedAt },
      ])
      .mockResolvedValueOnce([])

    const order: string[] = []
    mockProvider.delete.mockImplementation(async () => {
      order.push("blob")
    })
    mockPrisma.patientDocument.delete.mockImplementation(async () => {
      order.push("row")
      return {}
    })

    const res = await GET(makeRequest(CRON_SECRET))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.processed.purged).toBe(1)
    expect(order).toEqual(["blob", "row"])
    expect(mockPrisma.auditLog.create).toHaveBeenCalled()
  })

  it("does not purge documents still within the retention window", async () => {
    const recent = new Date(Date.now() - 5 * DAY_MS)
    mockPrisma.patientDocument.groupBy.mockResolvedValue([{ clinicId: "c1" }])
    mockPrisma.patientDocument.findMany
      .mockResolvedValueOnce([
        { id: "d1", storageKey: "clinics/c1/patients/p1/d1-x.pdf", deletedAt: recent },
      ])
      .mockResolvedValueOnce([])

    const res = await GET(makeRequest(CRON_SECRET))
    const json = await res.json()
    expect(json.processed.purged).toBe(0)
    expect(mockPrisma.patientDocument.delete).not.toHaveBeenCalled()
  })
})

describe("GET /api/jobs/cleanup-documents — orphans", () => {
  it("deletes orphan blobs older than the grace window", async () => {
    mockPrisma.patientDocument.groupBy.mockResolvedValue([{ clinicId: "c1" }])
    mockPrisma.patientDocument.findMany
      .mockResolvedValueOnce([]) // no trashed
      .mockResolvedValueOnce([{ storageKey: "clinics/c1/patients/p1/known.pdf" }])
    mockProvider.list.mockResolvedValue([
      {
        key: "clinics/c1/patients/p1/orphan.pdf",
        sizeBytes: 100,
        uploadedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
      {
        key: "clinics/c1/patients/p1/known.pdf",
        sizeBytes: 100,
        uploadedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    ])

    const res = await GET(makeRequest(CRON_SECRET))
    const json = await res.json()
    expect(json.processed.orphansDeleted).toBe(1)
    expect(mockProvider.delete).toHaveBeenCalledWith("clinics/c1/patients/p1/orphan.pdf")
  })
})

describe("GET /api/jobs/cleanup-documents — resilience", () => {
  it("one clinic's error does not abort the others", async () => {
    mockPrisma.patientDocument.groupBy.mockResolvedValue([
      { clinicId: "c1" },
      { clinicId: "c2" },
    ])
    // c1's trashed query throws; c2 proceeds normally.
    mockPrisma.patientDocument.findMany
      .mockRejectedValueOnce(new Error("db blew up"))
      .mockResolvedValueOnce([]) // c2 trashed
      .mockResolvedValueOnce([]) // c2 known keys

    const res = await GET(makeRequest(CRON_SECRET))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.processed.clinics).toBe(2)
    expect(json.errors).toHaveLength(1)
    expect(json.errors[0]).toContain("c1")
  })
})
