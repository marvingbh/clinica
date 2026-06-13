import { describe, it, expect } from "vitest"
import {
  sanitizeFilename,
  buildStorageKey,
  clinicPrefix,
  keyBelongsTo,
} from "./keys"

describe("sanitizeFilename", () => {
  it("strips accents", () => {
    expect(sanitizeFilename("laudó é.pdf")).toBe("laudo-e.pdf")
  })

  it("removes emoji and other unsafe characters", () => {
    expect(sanitizeFilename("foto 🎉 final!.png")).toBe("foto-final-.png")
  })

  it("defeats path traversal", () => {
    const result = sanitizeFilename("../../etc/passwd")
    expect(result).not.toContain("..")
    expect(result).not.toContain("/")
    expect(result).toBe("passwd")
  })

  it("truncates names longer than 80 chars", () => {
    const long = "a".repeat(200) + ".pdf"
    const result = sanitizeFilename(long)
    expect(result.length).toBeLessThanOrEqual(80)
  })

  it("falls back to 'arquivo' for empty/unsafe-only names", () => {
    expect(sanitizeFilename("")).toBe("arquivo")
    expect(sanitizeFilename("   ")).toBe("arquivo")
    expect(sanitizeFilename("🎉🎉🎉")).toBe("arquivo")
    expect(sanitizeFilename("...")).toBe("arquivo")
  })

  it("never starts or ends with a separator/dot", () => {
    const result = sanitizeFilename(".hidden-file.")
    expect(result.startsWith(".")).toBe(false)
    expect(result.startsWith("-")).toBe(false)
    expect(result.endsWith(".")).toBe(false)
    expect(result.endsWith("-")).toBe(false)
  })
})

describe("buildStorageKey", () => {
  it("produces the full clinic/patient/document path", () => {
    const key = buildStorageKey({
      clinicId: "c1",
      patientId: "p1",
      documentId: "d1",
      filename: "laudó.pdf",
    })
    expect(key).toBe("clinics/c1/patients/p1/d1-laudo.pdf")
  })
})

describe("clinicPrefix", () => {
  it("builds the clinic prefix with trailing slash", () => {
    expect(clinicPrefix("abc")).toBe("clinics/abc/")
  })
})

describe("keyBelongsTo", () => {
  const key = "clinics/c1/patients/p1/d1-laudo.pdf"

  it("returns true for the matching clinic + patient", () => {
    expect(keyBelongsTo(key, "c1", "p1")).toBe(true)
  })

  it("returns false for another clinic", () => {
    expect(keyBelongsTo(key, "c2", "p1")).toBe(false)
  })

  it("returns false for another patient", () => {
    expect(keyBelongsTo(key, "c1", "p2")).toBe(false)
  })

  it("rejects a malicious partial-prefix clinic id", () => {
    // "clinics/c1x/..." must NOT match clinic "c1".
    const evil = "clinics/c1x/patients/p1/d1-x.pdf"
    expect(keyBelongsTo(evil, "c1", "p1")).toBe(false)
  })

  it("rejects keys containing traversal sequences", () => {
    expect(keyBelongsTo("clinics/c1/patients/p1/../../x", "c1", "p1")).toBe(false)
  })

  it("rejects the bare prefix with no object name", () => {
    expect(keyBelongsTo("clinics/c1/patients/p1/", "c1", "p1")).toBe(false)
  })

  it("rejects empty input", () => {
    expect(keyBelongsTo("", "c1", "p1")).toBe(false)
  })
})
