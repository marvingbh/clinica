"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { AGENDA_COLOR_SLOTS, type AgendaColors } from "@/lib/clinic/colors/types"

const AgendaColorsContext = createContext<AgendaColors | null>(null)

interface Props {
  /** Already resolved & frozen by `resolveAgendaColors` at the layer above. */
  value: AgendaColors
  children: ReactNode
}

/**
 * Provides the current clinic's agenda color preferences to the agenda subtree.
 *
 * IMPORTANT — the `value` is memoized on the per-slot palette name strings so
 * that parent re-renders (date change, professional filter, drag) don't
 * invalidate the ~50–200 React.memo'd `AppointmentBlock` consumers via
 * context updates. The dep list is generated from `AGENDA_COLOR_SLOTS` so
 * adding a new slot can never silently break the memo (would otherwise leave
 * the new slot's value stale until another slot changes — caught in review).
 */
export function AgendaColorsProvider({ value, children }: Props) {
  const memoValue = useMemo(
    () => value,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on each slot's palette name, not the object identity
    AGENDA_COLOR_SLOTS.map((slot) => value[slot]),
  )
  return (
    <AgendaColorsContext.Provider value={memoValue}>
      {children}
    </AgendaColorsContext.Provider>
  )
}

/**
 * Reads the active clinic's agenda colors. Throws if called outside a
 * provider — this is a loud-fail by design so missing-provider bugs surface
 * immediately rather than silently rendering with defaults.
 */
export function useAgendaColors(): AgendaColors {
  const value = useContext(AgendaColorsContext)
  if (!value) {
    throw new Error("useAgendaColors must be called inside <AgendaColorsProvider>")
  }
  return value
}
