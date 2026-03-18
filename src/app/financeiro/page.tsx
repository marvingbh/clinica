"use client"

import React, { useState, useRef } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useFinanceiroContext } from "./context/FinanceiroContext"
import { DashboardData, InsightsData, MONTH_NAMES } from "./components/dashboard-shared"
import { DashboardResumo } from "./components/DashboardResumo"
import { InsightsCobranca } from "./components/InsightsCobranca"
import { InsightsAtendimento } from "./components/InsightsAtendimento"
import { InsightsAnalise } from "./components/InsightsAnalise"

type Tab = "resumo" | "cobranca" | "atendimento" | "analise"

const TABS: { key: Tab; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "cobranca", label: "Cobrança" },
  { key: "atendimento", label: "Atendimento" },
  { key: "analise", label: "Análise" },
]

function buildParams(year: number, month: number | null) {
  const params = new URLSearchParams({ year: String(year) })
  if (month) params.set("month", String(month))
  return params
}

export default function FinanceiroDashboard() {
  const { year, month, setMonth } = useFinanceiroContext()
  const [tab, setTab] = useState<Tab>("resumo")
  const [data, setData] = useState<DashboardData | null>(null)
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const insightsFetched = useRef<string | null>(null)

   
  useEffect(() => {
    let cancelled = false
    fetch(`/api/financeiro/dashboard?${buildParams(year, month)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month])

  // Fetch insights lazily on first non-resumo tab visit, or when period changes
   
  useEffect(() => {
    if (tab === "resumo") return
    const key = `${year}-${month}`
    if (insightsFetched.current === key) return
    insightsFetched.current = key
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading indicator for async fetch
    setInsightsLoading(true)
    fetch(`/api/financeiro/dashboard/insights?${buildParams(year, month)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setInsights(d) })
      .finally(() => { if (!cancelled) setInsightsLoading(false) })
    return () => { cancelled = true }
  }, [tab, year, month])

  if (loading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  if (!data) return <div className="text-destructive">Erro ao carregar dados</div>

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">
        {month ? `${MONTH_NAMES[month - 1]} ${year}` : `Consolidado ${year}`}
      </h2>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "resumo" && <DashboardResumo data={data} month={month} onMonthClick={setMonth} />}

      {tab !== "resumo" && insightsLoading && (
        <div className="animate-pulse text-muted-foreground py-8 text-center">Carregando insights...</div>
      )}

      {tab === "cobranca" && insights && !insightsLoading && <InsightsCobranca data={insights} />}
      {tab === "atendimento" && insights && !insightsLoading && <InsightsAtendimento data={insights} />}
      {tab === "analise" && insights && !insightsLoading && <InsightsAnalise data={insights} />}
    </div>
  )
}
