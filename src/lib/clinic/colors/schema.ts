import { z } from "zod"
import {
  AGENDA_COLOR_SLOTS,
  PALETTE_NAMES,
  type AgendaColorSlot,
  type AgendaColors,
  type PaletteName,
} from "./types"

const paletteNameSchema = z.enum(PALETTE_NAMES)

/**
 * Full Zod schema for a complete `agendaColors` object. Used by the resolver
 * as a contract reference. The PATCH endpoint uses `.partial().strict()` so
 * admins can update one slot at a time without sending the whole object.
 *
 * `.strict()` rejects unknown keys, which neutralises prototype-pollution-style
 * payloads (`{ __proto__: {...} }`) at the API boundary.
 */
export const agendaColorsSchema = z
  .object({
    consulta: paletteNameSchema,
    reuniao: paletteNameSchema,
    lembrete: paletteNameSchema,
    groupSession: paletteNameSchema,
    availability: paletteNameSchema,
  })
  .strict()

/** Partial schema for the PATCH endpoint — admins update one slot at a time. */
export const agendaColorsPatchSchema = agendaColorsSchema.partial().strict()

export const DEFAULT_AGENDA_COLORS: AgendaColors = Object.freeze({
  consulta: "red",
  reuniao: "blue",
  lembrete: "yellow",
  groupSession: "violet",
  availability: "green",
})

/**
 * Per-key narrowing of an opaque value loaded from the DB.
 *
 * The persisted column may be:
 *   - `undefined`  — Prisma omitted the field from `select`
 *   - SQL `NULL`   — only possible if column gets dropped to nullable later
 *   - JSON `null`  — the value `null` inside a JSONB cell
 *   - scalar/array — someone wrote raw via SQL
 *   - partial obj  — older row missing a slot
 *   - unknown keys — schema rolled back, or attacker bypassed Zod
 *
 * In every case the result is a fully-defaulted, frozen `AgendaColors`. Reads
 * of `Clinic.agendaColors` MUST go through this function — direct
 * `clinic.agendaColors as AgendaColors` casts are unsafe and forbidden by
 * code review.
 */
export function resolveAgendaColors(stored: unknown): AgendaColors {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return DEFAULT_AGENDA_COLORS
  }
  const obj = stored as Record<string, unknown>
  const out: Record<AgendaColorSlot, PaletteName> = { ...DEFAULT_AGENDA_COLORS }
  for (const slot of AGENDA_COLOR_SLOTS) {
    const v = obj[slot]
    if (typeof v === "string" && (PALETTE_NAMES as readonly string[]).includes(v)) {
      out[slot] = v as PaletteName
    }
  }
  return Object.freeze(out)
}
