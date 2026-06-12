/**
 * Validation/normalization of the provider's SectionMap (pure).
 *
 * Defensive even with structured output: fills missing keys with "", drops
 * extra keys, coerces primitive values with String(), and returns null when
 * nothing usable is present (→ treated as FAILED, no credit consumed).
 */

import type { SectionMap } from "./types"

export function parseDraftSections(raw: unknown, expectedKeys: string[]): SectionMap | null {
  let obj: unknown = raw

  // Accept a JSON string.
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw)
    } catch {
      return null
    }
  }

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return null
  }

  const source = obj as Record<string, unknown>
  const result: SectionMap = {}
  let anyContent = false

  for (const key of expectedKeys) {
    const value = source[key]
    if (typeof value === "string") {
      result[key] = value
      if (value.trim().length > 0) anyContent = true
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value)
      anyContent = true
    } else {
      // Missing or object/array value → empty section.
      result[key] = ""
    }
  }

  return anyContent ? result : null
}
