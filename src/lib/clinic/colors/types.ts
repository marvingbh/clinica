/**
 * Type contracts for per-clinic agenda color preferences.
 *
 * The four canonical sources of truth in this file (PALETTE_NAMES,
 * AGENDA_COLOR_SLOTS, the derived types) are reused by the Zod schema, the
 * literal class map, and React/form code. Keeping them all derived from `as
 * const` arrays guarantees they cannot drift.
 */

/** Tailwind palette names admins can pick from. */
export const PALETTE_NAMES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
  // Special: white background with black text (the original CONSULTA look,
  // restored as a configurable option). Different shape from the other
  // palettes — bg uses `bg-white`, text/accent use `text-black`/`bg-black`.
  "white",
] as const

export type PaletteName = (typeof PALETTE_NAMES)[number]

/** Configurable agenda surfaces. Order is the order the settings UI renders. */
export const AGENDA_COLOR_SLOTS = [
  "consulta",
  "reuniao",
  "lembrete",
  "groupSession",
  "availability",
] as const

export type AgendaColorSlot = (typeof AGENDA_COLOR_SLOTS)[number]

export type AgendaColors = Readonly<Record<AgendaColorSlot, PaletteName>>

/** Resolved Tailwind class strings for a single block (or chip) on the agenda. */
export type EntryColors = Readonly<{
  bg: string
  border: string
  borderLeft: string
  text: string
  accent: string
}>
