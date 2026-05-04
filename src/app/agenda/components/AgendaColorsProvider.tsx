"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AgendaColors } from "@/lib/clinic/colors/types"

const AgendaColorsContext = createContext<AgendaColors | null>(null)

interface Props {
  /** Already resolved & frozen by `resolveAgendaColors` at the layer above. */
  value: AgendaColors
  children: ReactNode
}

/**
 * Provides the current clinic's agenda color preferences to the agenda subtree.
 *
 * IMPORTANT — the `value` is memoized on the 5 palette name strings so that
 * parent re-renders (date change, professional filter, drag) don't invalidate
 * the ~50–200 React.memo'd `AppointmentBlock` consumers via context updates.
 * Without this, `memo` cannot stop the cascade.
 */
export function AgendaColorsProvider({ value, children }: Props) {
  const memoValue = useMemo(
    () => value,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on the 5 palette names, not the object identity
    [
      value.consulta,
      value.reuniao,
      value.lembrete,
      value.groupSession,
      value.availability,
    ],
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
