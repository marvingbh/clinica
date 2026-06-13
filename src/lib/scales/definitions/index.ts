import type { ScaleCode, ScaleDefinition } from "../types"
import { PHQ9_DEFINITION } from "./phq9"
import { GAD7_DEFINITION } from "./gad7"

export { PHQ9_DEFINITION } from "./phq9"
export { GAD7_DEFINITION } from "./gad7"

/** Registry of all available scale definitions, keyed by code. */
export const SCALE_DEFINITIONS: Readonly<Record<ScaleCode, ScaleDefinition>> = {
  PHQ9: PHQ9_DEFINITION,
  GAD7: GAD7_DEFINITION,
}

/** Type guard: is the given string a known scale code? */
export function isScaleCode(code: string): code is ScaleCode {
  return code === "PHQ9" || code === "GAD7"
}

/**
 * Returns the definition for a scale code. Throws on an unknown code — the
 * caller (route handler) is expected to validate input first.
 */
export function getScaleDefinition(code: string): ScaleDefinition {
  if (!isScaleCode(code)) {
    throw new Error(`Escala desconhecida: ${code}`)
  }
  return SCALE_DEFINITIONS[code]
}

/** Lightweight listing for pickers (code + names only). */
export function listScales(): Array<Pick<ScaleDefinition, "code" | "name" | "shortName">> {
  return Object.values(SCALE_DEFINITIONS).map((d) => ({
    code: d.code,
    name: d.name,
    shortName: d.shortName,
  }))
}
