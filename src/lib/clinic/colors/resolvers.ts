import { ENTRY_TYPE_COLORS } from "@/app/agenda/lib/constants"
import type { CalendarEntryType } from "@/app/agenda/lib/types"
import { PALETTE_CLASSES } from "./palette"
import type { AgendaColorSlot, AgendaColors, EntryColors } from "./types"

/**
 * Single generic resolver: pick the configured palette for a slot. Use this
 * for the agenda surfaces that don't map 1:1 to an appointment type
 * (group sessions, availability slots).
 */
export function paletteFor(slot: AgendaColorSlot, colors: AgendaColors): EntryColors {
  return PALETTE_CLASSES[colors[slot]]
}

/**
 * Resolver for appointment blocks. CONSULTA/REUNIAO/LEMBRETE follow the
 * configured clinic palette. TAREFA and NOTA are no longer creatable from the
 * UI but legacy records still exist and continue to render via the original
 * `ENTRY_TYPE_COLORS` constants — no data migration needed.
 */
export function appointmentColorsFor(
  type: CalendarEntryType,
  colors: AgendaColors,
): EntryColors {
  switch (type) {
    case "CONSULTA":
      return PALETTE_CLASSES[colors.consulta]
    case "REUNIAO":
      return PALETTE_CLASSES[colors.reuniao]
    case "LEMBRETE":
      return PALETTE_CLASSES[colors.lembrete]
    case "TAREFA":
      return ENTRY_TYPE_COLORS.TAREFA
    case "NOTA":
      return ENTRY_TYPE_COLORS.NOTA
    default: {
      // Exhaustive check — adding a new CalendarEntryType forces an update here.
      const _exhaustive: never = type
      throw new Error(`Unhandled entry type: ${String(_exhaustive)}`)
    }
  }
}
