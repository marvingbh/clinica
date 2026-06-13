import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockPrisma, mockProvider } = vi.hoisted(() => {
  const mp = {
    patientDocument: { create: vi.fn().mockResolvedValue({ id: "doc1" }) },
  }
  const provider = {
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    list: vi.fn(),
    head: vi.fn(),
    getDownloadStream: vi.fn(),
  }
  return { mockPrisma: mp, mockProvider: provider }
})

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/storage/server", () => ({ getStorageProvider: () => mockProvider }))
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake")),
}))
vi.mock("@/lib/forms/pdf/ResponsePdf", () => ({
  createResponseDocument: vi.fn().mockReturnValue({}),
}))
vi.mock("@/lib/forms", () => ({
  parseFieldsSafe: vi.fn().mockReturnValue([]),
}))

import { archiveFormResponseAsDocument } from "./archive-form"

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.patientDocument.create.mockResolvedValue({ id: "doc1" })
  mockProvider.put.mockResolvedValue(undefined)
})

describe("archiveFormResponseAsDocument", () => {
  const response = {
    id: "resp1",
    completedAt: new Date("2026-06-12T10:00:00Z"),
    answers: { a: 1 },
    professionalProfileId: "pp1",
    patient: { id: "p1", name: "Maria Silva" },
    clinic: { id: "c1", name: "Clínica Teste" },
    formVersion: { version: 2, fields: [], template: { name: "Anamnese Inicial" } },
  }

  it("stores the rendered PDF under the patient prefix and registers a FORMULARIO document", async () => {
    const result = await archiveFormResponseAsDocument(response)
    expect(result).toEqual({ id: "doc1" })

    // Blob stored under the clinic/patient prefix as a PDF.
    expect(mockProvider.put).toHaveBeenCalledTimes(1)
    const [key, , opts] = mockProvider.put.mock.calls[0]
    expect(key).toMatch(/^clinics\/c1\/patients\/p1\//)
    expect(opts.mimeType).toBe("application/pdf")

    // Row created as a system document (no uploader, source FORMULARIO).
    expect(mockPrisma.patientDocument.create).toHaveBeenCalledTimes(1)
    const data = mockPrisma.patientDocument.create.mock.calls[0][0].data
    expect(data.source).toBe("FORMULARIO")
    expect(data.uploaderUserId).toBeNull()
    expect(data.clinicId).toBe("c1")
    expect(data.patientId).toBe("p1")
    expect(data.mimeType).toBe("application/pdf")
    expect(data.storageKey).toBe(key)
    expect(data.sizeBytes).toBeGreaterThan(0)
  })
})
