"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface FinanceiroContextValue {
  year: number
  month: number | null
  setYear: (year: number) => void
  setMonth: (month: number | null) => void
}

const FinanceiroContext = createContext<FinanceiroContextValue | null>(null)

export function FinanceiroProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState(() => new Date().getFullYear())
  const [month, setMonthState] = useState<number | null>(null)

  const setYear = useCallback((y: number) => setYearState(y), [])
  const setMonth = useCallback((m: number | null) => setMonthState(m), [])

  return (
    <FinanceiroContext.Provider value={{ year, month, setYear, setMonth }}>
      {children}
    </FinanceiroContext.Provider>
  )
}

export function useFinanceiroContext(): FinanceiroContextValue {
  const context = useContext(FinanceiroContext)
  if (!context) {
    throw new Error("useFinanceiroContext must be used within a FinanceiroProvider")
  }
  return context
}
