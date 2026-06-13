/**
 * Pure helpers for storage-key generation and validation.
 *
 * A storage key is the path of a blob inside the provider:
 *   clinics/{clinicId}/patients/{patientId}/{documentId}-{sanitizedFilename}
 *
 * The original filename is preserved intact in the database (`filename`
 * column); the key only uses a sanitized, path-traversal-safe slug.
 */

const MAX_SLUG_LENGTH = 80

/**
 * Normalize a filename into a safe, ASCII-only slug for use inside a storage
 * key. Strips accents, replaces unsafe characters with "-", collapses repeated
 * separators, trims to {@link MAX_SLUG_LENGTH} chars, and never returns an
 * empty string (falls back to "arquivo").
 */
export function sanitizeFilename(filename: string): string {
  const base = (filename ?? "").trim()
  // Decompose accents (NFD) and drop the combining marks.
  const noAccents = base.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  // Strip any directory components to defeat path traversal (../, /etc, ...).
  const lastSegment = noAccents.split(/[\\/]/).pop() ?? ""
  const slug = lastSegment
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "") // never start with a dot/dash (hidden files / leading sep)
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/[-.]+$/, "") // never end with a dot/dash
  return slug.length > 0 ? slug : "arquivo"
}

export function clinicPrefix(clinicId: string): string {
  return `clinics/${clinicId}/`
}

export function patientPrefix(clinicId: string, patientId: string): string {
  return `clinics/${clinicId}/patients/${patientId}/`
}

export function buildStorageKey(p: {
  clinicId: string
  patientId: string
  documentId: string
  filename: string
}): string {
  return `${patientPrefix(p.clinicId, p.patientId)}${p.documentId}-${sanitizeFilename(p.filename)}`
}

/**
 * Validates that a key belongs to exactly the given clinic + patient prefix.
 * Anti cross-tenant barrier for registering client-uploaded blobs: a client
 * cannot register a blob keyed under another clinic/patient.
 */
export function keyBelongsTo(
  key: string,
  clinicId: string,
  patientId: string
): boolean {
  if (typeof key !== "string" || key.length === 0) return false
  if (key.includes("..")) return false
  const expected = patientPrefix(clinicId, patientId)
  // Must start with the exact prefix AND have a non-empty object name after it.
  return key.startsWith(expected) && key.length > expected.length
}
