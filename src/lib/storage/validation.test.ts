import { describe, it, expect } from "vitest"
import {
  ALLOWED_MIME_TYPES,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  getMaxFileSizeBytes,
  validateUpload,
  isPreviewable,
} from "./validation"

const MAX = DEFAULT_MAX_FILE_SIZE_BYTES

function ok(mimeType: string, filename: string) {
  return validateUpload({ filename, mimeType, sizeBytes: 1024, maxSizeBytes: MAX })
}

describe("validateUpload — allowlist", () => {
  it("accepts every MIME in the allowlist with a coherent extension", () => {
    const cases: Array<[string, string]> = [
      ["application/pdf", "laudo.pdf"],
      ["image/jpeg", "foto.jpg"],
      ["image/jpeg", "foto.jpeg"],
      ["image/png", "exame.png"],
      ["image/webp", "imagem.webp"],
      ["application/msword", "contrato.doc"],
      [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "contrato.docx",
      ],
      ["application/vnd.ms-excel", "planilha.xls"],
      [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "planilha.xlsx",
      ],
      ["text/plain", "nota.txt"],
      ["text/csv", "dados.csv"],
    ]
    for (const [mime, name] of cases) {
      expect(ok(mime, name)).toEqual({ ok: true })
    }
  })

  it("covers exactly the documented MIME types", () => {
    expect(ALLOWED_MIME_TYPES.size).toBe(10)
  })

  it("rejects a disallowed MIME (executable)", () => {
    const r = validateUpload({
      filename: "virus.exe",
      mimeType: "application/x-msdownload",
      sizeBytes: 1024,
      maxSizeBytes: MAX,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não permitido/)
  })

  it("rejects image/gif", () => {
    expect(ok("image/gif", "anim.gif").ok).toBe(false)
  })
})

describe("validateUpload — extension coherence", () => {
  it("rejects a .exe declared as application/pdf", () => {
    const r = validateUpload({
      filename: "laudo.exe",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      maxSizeBytes: MAX,
    })
    expect(r.ok).toBe(false)
  })

  it("rejects a file with no extension", () => {
    expect(ok("application/pdf", "semextensao").ok).toBe(false)
  })

  it("treats the extension case-insensitively", () => {
    expect(ok("application/pdf", "LAUDO.PDF")).toEqual({ ok: true })
  })
})

describe("validateUpload — size", () => {
  it("rejects 0 bytes as empty", () => {
    const r = validateUpload({
      filename: "vazio.pdf",
      mimeType: "application/pdf",
      sizeBytes: 0,
      maxSizeBytes: MAX,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Arquivo vazio.")
  })

  it("rejects files above the limit", () => {
    const r = validateUpload({
      filename: "grande.pdf",
      mimeType: "application/pdf",
      sizeBytes: MAX + 1,
      maxSizeBytes: MAX,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/excede o limite de 10 MB/)
  })

  it("accepts a file exactly at the limit (boundary)", () => {
    const r = validateUpload({
      filename: "limite.pdf",
      mimeType: "application/pdf",
      sizeBytes: MAX,
      maxSizeBytes: MAX,
    })
    expect(r).toEqual({ ok: true })
  })
})

describe("getMaxFileSizeBytes", () => {
  it("returns the default when env is undefined/empty", () => {
    expect(getMaxFileSizeBytes(undefined)).toBe(DEFAULT_MAX_FILE_SIZE_BYTES)
    expect(getMaxFileSizeBytes("")).toBe(DEFAULT_MAX_FILE_SIZE_BYTES)
    expect(getMaxFileSizeBytes("  ")).toBe(DEFAULT_MAX_FILE_SIZE_BYTES)
  })

  it("honors a numeric env override (MB)", () => {
    expect(getMaxFileSizeBytes("25")).toBe(25 * 1024 * 1024)
  })

  it("falls back to default on invalid override", () => {
    expect(getMaxFileSizeBytes("abc")).toBe(DEFAULT_MAX_FILE_SIZE_BYTES)
    expect(getMaxFileSizeBytes("0")).toBe(DEFAULT_MAX_FILE_SIZE_BYTES)
    expect(getMaxFileSizeBytes("-5")).toBe(DEFAULT_MAX_FILE_SIZE_BYTES)
  })
})

describe("isPreviewable", () => {
  it("PDF and images preview; Office/text do not", () => {
    expect(isPreviewable("application/pdf")).toBe(true)
    expect(isPreviewable("image/png")).toBe(true)
    expect(isPreviewable("text/plain")).toBe(false)
    expect(isPreviewable("application/msword")).toBe(false)
  })
})
