import { describe, it, expect, vi } from "vitest"
import {
  registerSystemDocument,
  type PatientDocumentCreateDb,
} from "./register"

function mockDb() {
  const create = vi.fn().mockResolvedValue({ id: "doc1" })
  const db = { patientDocument: { create } } as unknown as PatientDocumentCreateDb
  return { db, create }
}

describe("registerSystemDocument", () => {
  it("creates a row with uploaderUserId null and the given source", async () => {
    const { db, create } = mockDb()
    const result = await registerSystemDocument(db, {
      clinicId: "c1",
      patientId: "p1",
      source: "ASSINADO",
      filename: "tcle.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      storageKey: "clinics/c1/patients/p1/d1-tcle.pdf",
      category: "CONTRATO",
      description: "TCLE assinado",
    })
    expect(result).toEqual({ id: "doc1" })
    expect(create).toHaveBeenCalledTimes(1)
    const arg = create.mock.calls[0][0]
    expect(arg.data.uploaderUserId).toBeNull()
    expect(arg.data.source).toBe("ASSINADO")
    expect(arg.data.category).toBe("CONTRATO")
    expect(arg.data.clinicId).toBe("c1")
    expect(arg.data.sharedWithPatient).toBe(false)
  })

  it("defaults category to DOCUMENTO and sharedWithPatient to false", async () => {
    const { db, create } = mockDb()
    await registerSystemDocument(db, {
      clinicId: "c1",
      patientId: "p1",
      source: "GERADO",
      filename: "laudo.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      storageKey: "clinics/c1/patients/p1/d2-laudo.pdf",
    })
    const arg = create.mock.calls[0][0]
    expect(arg.data.category).toBe("DOCUMENTO")
    expect(arg.data.description).toBeNull()
  })

  it("refuses source UPLOAD", async () => {
    const { db, create } = mockDb()
    await expect(
      registerSystemDocument(db, {
        clinicId: "c1",
        patientId: "p1",
        // @ts-expect-error — testing the runtime guard against UPLOAD
        source: "UPLOAD",
        filename: "x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        storageKey: "clinics/c1/patients/p1/d3-x.pdf",
      })
    ).rejects.toThrow(/UPLOAD/)
    expect(create).not.toHaveBeenCalled()
  })
})
