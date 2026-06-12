/**
 * Slug helpers for a professional's public booking deep link
 * (/agendar/[clinicSlug]/[professionalSlug]).
 *
 * Uniqueness is enforced PER CLINIC in app code (ProfessionalProfile has no
 * clinicId column), never via a global DB unique.
 */

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Honorific prefixes commonly typed before professional names (pt-BR).
// Dropped from the leading position so the slug starts with the actual name.
const TITLE_PREFIXES = new Set(["dr", "dra", "drs", "psi", "prof", "profa"])

/**
 * Normalizes a name into a URL-safe slug:
 *   "Dra. Ana Müller" → "ana-muller"
 * Strips a leading honorific, diacritics, lowercases, drops non-alphanumerics,
 * and collapses hyphens.
 */
export function slugifyProfessionalName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-") // collapse runs of hyphens

  const parts = base.split("-").filter(Boolean)
  if (parts.length > 1 && TITLE_PREFIXES.has(parts[0])) {
    parts.shift()
  }
  return parts.join("-")
}

/**
 * Validates a stored/edited slug: lowercase alphanumerics separated by single
 * hyphens, 2–60 chars, no leading/trailing/double hyphens.
 */
export function isValidBookingSlug(slug: string): boolean {
  if (slug.length < 2 || slug.length > 60) return false
  return SLUG_REGEX.test(slug)
}
