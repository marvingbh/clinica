import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: (...args: unknown[]) => unknown) => handler,
  forbiddenResponse: (message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 403 }),
}))

vi.mock("@/lib/rbac/audit", () => ({
  audit: { log: vi.fn().mockResolvedValue(undefined) },
  AuditAction: { RECIBO_SAUDE_RESULT_IMPORTED: "RECIBO_SAUDE_RESULT_IMPORTED" },
}))

const mockBatchFindFirst = vi.fn()
const mockEmissionUpdateMany = vi.fn()
const mockBatchUpdate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reciboSaudeBatch: {
      findFirst: (...a: unknown[]) => mockBatchFindFirst(...a),
      update: (...a: unknown[]) => mockBatchUpdate(...a),
    },
    reciboSaudeEmission: {
      updateMany: (...a: unknown[]) => mockEmissionUpdateMany(...a),
    },
  },
}))

import { POST } from "./route"

const adminUser = { id: "u1", clinicId: "c1", role: "ADMIN" as const, professionalProfileId: null }

function call(id: string, body: unknown) {
  const req = new NextRequest(new URL("http://localhost/x"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
  const handler = POST as unknown as (
    r: NextRequest,
    c: { user: typeof adminUser },
    p: Record<string, string>
  ) => Promise<Response>
  return handler(req, { user: adminUser }, { id })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBatchFindFirst.mockResolvedValue({ id: "batch1", professionalProfileId: "prof1" })
  mockEmissionUpdateMany.mockResolvedValue({ count: 1 })
  mockBatchUpdate.mockResolvedValue({})
})

describe("POST batches/[id]/result", () => {
  it("marks emissions EMITIDO and ERRO from the result file", async () => {
    const fileContent = ["S|recl:l1|RS-000123", "E|inv:i2|CPF invalido"].join("\n")
    const res = await call("batch1", { fileContent })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ emitted: 1, errored: 1 })
    expect(mockEmissionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paymentKey: "recl:l1", batchId: "batch1", clinicId: "c1" }),
        data: expect.objectContaining({ status: "EMITIDO", reciboNumero: "RS-000123" }),
      })
    )
    expect(mockEmissionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paymentKey: "inv:i2" }),
        data: expect.objectContaining({ status: "ERRO", erro: "CPF invalido" }),
      })
    )
    expect(mockBatchUpdate).toHaveBeenCalled()
  })

  it("is idempotent on a re-upload (converges to the same updates)", async () => {
    const fileContent = "S|recl:l1|RS-1"
    await call("batch1", { fileContent })
    vi.clearAllMocks()
    mockBatchFindFirst.mockResolvedValue({ id: "batch1", professionalProfileId: "prof1" })
    mockEmissionUpdateMany.mockResolvedValue({ count: 1 })
    mockBatchUpdate.mockResolvedValue({})

    const res = await call("batch1", { fileContent })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emitted).toBe(1)
  })

  it("returns 404 when the batch belongs to another clinic", async () => {
    mockBatchFindFirst.mockResolvedValue(null)
    const res = await call("batch-x", { fileContent: "S|recl:l1|RS-1" })
    expect(res.status).toBe(404)
    expect(mockEmissionUpdateMany).not.toHaveBeenCalled()
  })

  it("returns 422 on an unparseable result file", async () => {
    const res = await call("batch1", { fileContent: "total garbage no markers" })
    expect(res.status).toBe(422)
    expect(mockEmissionUpdateMany).not.toHaveBeenCalled()
  })
})
