import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { signDocumentLink, verifyDocumentLink, buildDocumentDownloadUrl } from "./document-links"

const TEST_SECRET = "test-secret-key-for-hmac"
const DOCUMENT_ID = "doc_clxyz123abc"
const BASE_URL = "https://clinica.example.com"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-06-11T10:00:00Z"))
  vi.stubEnv("AUTH_SECRET", TEST_SECRET)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("signDocumentLink / verifyDocumentLink", () => {
  it("round-trips a valid signature", () => {
    const { expires, sig } = signDocumentLink(DOCUMENT_ID)
    expect(verifyDocumentLink(DOCUMENT_ID, expires, sig)).toEqual({ valid: true })
  })

  it("expires after 7 days with a pt-BR message", () => {
    const { expires, sig } = signDocumentLink(DOCUMENT_ID)
    vi.setSystemTime(new Date("2026-06-19T10:00:01Z")) // > 7 days later
    const res = verifyDocumentLink(DOCUMENT_ID, expires, sig)
    expect(res.valid).toBe(false)
    expect(res.error).toBe("Este link expirou. Solicite um novo à clínica.")
  })

  it("rejects a tampered signature", () => {
    const { expires } = signDocumentLink(DOCUMENT_ID)
    const res = verifyDocumentLink(DOCUMENT_ID, expires, "deadbeef")
    expect(res.valid).toBe(false)
    expect(res.error).toBe("Link inválido")
  })

  it("rejects a signature for a different document id", () => {
    const { expires, sig } = signDocumentLink(DOCUMENT_ID)
    expect(verifyDocumentLink("other_doc", expires, sig).valid).toBe(false)
  })

  it("rejects a same-length but altered signature (timing-safe path)", () => {
    const { expires, sig } = signDocumentLink(DOCUMENT_ID)
    // Flip the last hex char so the length matches but the value differs,
    // forcing the timingSafeEqual branch rather than the length short-circuit.
    const altered = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0")
    const res = verifyDocumentLink(DOCUMENT_ID, expires, altered)
    expect(res.valid).toBe(false)
    expect(res.error).toBe("Link inválido")
  })
})

describe("buildDocumentDownloadUrl", () => {
  it("contains id, expires, and sig", () => {
    const url = buildDocumentDownloadUrl(BASE_URL, DOCUMENT_ID)
    expect(url).toContain(`/api/public/documents/${DOCUMENT_ID}/download`)
    expect(url).toMatch(/expires=\d+/)
    expect(url).toMatch(/sig=[a-f0-9]{64}/)
  })
})
