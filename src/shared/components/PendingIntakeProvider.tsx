"use client"

import { createContext, useContext } from "react"
import { usePendingIntakeCount, type PendingIntakeState } from "@/shared/hooks"

const PendingIntakeContext = createContext<PendingIntakeState>({
  count: 0,
  isLoading: true,
})

/**
 * Single source of truth for the pending intake submissions count.
 *
 * Mounted inside AppShell so the poll only runs on authenticated routes
 * (AppShell short-circuits on /login, /signup, /intake/[slug], etc.).
 */
export function PendingIntakeProvider({ children }: { children: React.ReactNode }) {
  const value = usePendingIntakeCount()
  return <PendingIntakeContext.Provider value={value}>{children}</PendingIntakeContext.Provider>
}

export function usePendingIntake(): PendingIntakeState {
  return useContext(PendingIntakeContext)
}
