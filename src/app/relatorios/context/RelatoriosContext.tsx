"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

export type Granularity = "month" | "quarter" | "year"

interface RelatoriosContextValue {
  granularity: Granularity
  year: number
  month: number // 1-12 (used when granularity = month)
  quarter: number // 1-4 (used when granularity = quarter)
  professionalId: string | null
  setGranularity: (g: Granularity) => void
  setYear: (y: number) => void
  setMonth: (m: number) => void
  setQuarter: (q: number) => void
  setProfessionalId: (id: string | null) => void
}

const RelatoriosContext = createContext<RelatoriosContextValue | null>(null)

export function RelatoriosProvider({ children }: { children: ReactNode }) {
  const now = new Date()
  const [granularity, setGranularityState] = useState<Granularity>("month")
  const [year, setYearState] = useState(() => now.getFullYear())
  const [month, setMonthState] = useState(() => now.getMonth() + 1)
  const [quarter, setQuarterState] = useState(() => Math.floor(now.getMonth() / 3) + 1)
  const [professionalId, setProfessionalIdState] = useState<string | null>(null)

  const setGranularity = useCallback((g: Granularity) => setGranularityState(g), [])
  const setYear = useCallback((y: number) => setYearState(y), [])
  const setMonth = useCallback((m: number) => setMonthState(m), [])
  const setQuarter = useCallback((q: number) => setQuarterState(q), [])
  const setProfessionalId = useCallback((id: string | null) => setProfessionalIdState(id), [])

  return (
    <RelatoriosContext.Provider
      value={{
        granularity, year, month, quarter, professionalId,
        setGranularity, setYear, setMonth, setQuarter, setProfessionalId,
      }}
    >
      {children}
    </RelatoriosContext.Provider>
  )
}

export function useRelatorios(): RelatoriosContextValue {
  const ctx = useContext(RelatoriosContext)
  if (!ctx) throw new Error("useRelatorios must be used within a RelatoriosProvider")
  return ctx
}

/** Build the query string the report API expects from the current filters. */
export function buildReportParams(ctx: {
  granularity: Granularity
  year: number
  month: number
  quarter: number
  professionalId: string | null
}): URLSearchParams {
  const params = new URLSearchParams({ year: String(ctx.year) })
  if (ctx.granularity === "month") params.set("month", String(ctx.month))
  else if (ctx.granularity === "quarter") params.set("quarter", String(ctx.quarter))
  if (ctx.professionalId) params.set("professionalId", ctx.professionalId)
  return params
}
