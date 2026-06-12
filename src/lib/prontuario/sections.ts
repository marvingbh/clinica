import { MAX_SECTION_LENGTH, type NoteSections, type SectionDef } from "./types"

/**
 * Validate a raw sections payload against the template definitions.
 * - keys must be a subset of `defs` ids
 * - values must be strings
 * - each section must be at most MAX_SECTION_LENGTH chars
 * Throws on invalid input; returns the validated NoteSections on success.
 */
export function validateSections(sections: unknown, defs: SectionDef[]): NoteSections {
  if (typeof sections !== "object" || sections === null || Array.isArray(sections)) {
    throw new Error("As seções devem ser um objeto.")
  }
  const allowed = new Set(defs.map((d) => d.id))
  const result: NoteSections = {}
  for (const [key, value] of Object.entries(sections as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      throw new Error(`Seção desconhecida: ${key}`)
    }
    if (typeof value !== "string") {
      throw new Error(`O valor da seção "${key}" deve ser texto.`)
    }
    if (value.length > MAX_SECTION_LENGTH) {
      throw new Error(`A seção "${key}" excede o limite de ${MAX_SECTION_LENGTH} caracteres.`)
    }
    result[key] = value
  }
  return result
}

/** True when at least one section has non-whitespace content. */
export function hasAnyContent(sections: NoteSections): boolean {
  return Object.values(sections).some((v) => typeof v === "string" && v.trim().length > 0)
}

/**
 * Merge a partial section update onto the current sections, preserving any
 * sections not present in the patch. Validates the patch against `defs`.
 */
export function mergeSectionUpdate(
  current: NoteSections,
  patch: NoteSections,
  defs: SectionDef[]
): NoteSections {
  const validatedPatch = validateSections(patch, defs)
  return { ...current, ...validatedPatch }
}
