/**
 * Pure upload validation: MIME allowlist, extension coherence, size limits.
 * Error messages are the pt-BR strings from the plan (§2.6), reused both on
 * the server (route) and the client (DocumentUploadZone).
 */

/** Allowed MIME types → permitted file extensions (lowercase, no dot). */
export const ALLOWED_MIME_TYPES: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["application/pdf", ["pdf"]],
    ["image/jpeg", ["jpg", "jpeg"]],
    ["image/png", ["png"]],
    ["image/webp", ["webp"]],
    ["application/msword", ["doc"]],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ["docx"],
    ],
    ["application/vnd.ms-excel", ["xls"]],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ["xlsx"],
    ],
    ["text/plain", ["txt"]],
    ["text/csv", ["csv"]],
  ])

export const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

/** MIME types that the UI can preview inline (the rest force download). */
export const PREVIEWABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
])

/**
 * Resolve the max file size in bytes, honoring the optional `DOCUMENT_MAX_SIZE_MB`
 * env override. Invalid/empty input falls back to the default.
 */
export function getMaxFileSizeBytes(env?: string): number {
  if (env === undefined || env === null || env.trim() === "") {
    return DEFAULT_MAX_FILE_SIZE_BYTES
  }
  const mb = Number(env)
  if (!Number.isFinite(mb) || mb <= 0) return DEFAULT_MAX_FILE_SIZE_BYTES
  return Math.floor(mb * 1024 * 1024)
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".")
  if (idx < 0 || idx === filename.length - 1) return ""
  return filename.slice(idx + 1).toLowerCase()
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  // Whole numbers render without decimals ("10 MB"); otherwise one decimal.
  const text = Number.isInteger(mb) ? String(mb) : mb.toFixed(1).replace(".", ",")
  return `${text} MB`
}

export interface ValidateUploadInput {
  filename: string
  mimeType: string
  sizeBytes: number
  maxSizeBytes: number
}

export type ValidateUploadResult = { ok: true } | { ok: false; error: string }

/**
 * Validate a single upload against the MIME allowlist, extension coherence,
 * empty-file rule, and the size limit. Returns the first pt-BR error message.
 */
export function validateUpload(input: ValidateUploadInput): ValidateUploadResult {
  const { filename, mimeType, sizeBytes, maxSizeBytes } = input

  const allowedExtensions = ALLOWED_MIME_TYPES.get(mimeType)
  if (!allowedExtensions) {
    return {
      ok: false,
      error:
        "Tipo de arquivo não permitido. Use PDF, imagens ou documentos do Office.",
    }
  }

  const ext = extensionOf(filename)
  if (!ext || !allowedExtensions.includes(ext)) {
    return {
      ok: false,
      error:
        "Tipo de arquivo não permitido. Use PDF, imagens ou documentos do Office.",
    }
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "Arquivo vazio." }
  }

  if (sizeBytes > maxSizeBytes) {
    return {
      ok: false,
      error: `Arquivo excede o limite de ${formatMb(maxSizeBytes)}.`,
    }
  }

  return { ok: true }
}

/** True when the MIME type can be previewed inline in the browser. */
export function isPreviewable(mimeType: string): boolean {
  return PREVIEWABLE_MIME_TYPES.has(mimeType)
}
