"use client"

import { useState, useCallback, useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { useFinanceiroContext } from "../context/FinanceiroContext"
import { CashFlowChart } from "./components/CashFlowChart"
import { CashFlowTable } from "./components/CashFlowTable"
import { CashFlowSummary } from "./components/CashFlowSummary"
import { CashFlowControls } from "./components/CashFlowControls"
import { ProjectionBreakdown } from "./components/ProjectionBreakdown"
import type { Granularity, CashFlowAlert } from "@/lib/cashflow"

interface Entry {
  date: string
  inflow: number
  outflow: number
  net: number
  runningBalance: number
}

interface Summary {
  totalInflow: number
  totalOutflow: number
  netFlow: number
  startingBalance: number
  projectedEndBalance: number
}

type ViewMode = "chart" | "table"
type CashFlowView = "realizado" | "projetado"

export default function FluxoDeCaixaPage() {
  const { year, month } = useFinanceiroContext()
  const [entries, setEntries] = useState<Entry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([])
  const [granularity, setGranularity] = useState<Granularity>("daily")
  const [viewMode, setViewMode] = useState<ViewMode>("chart")
  const [cashFlowView, setCashFlowView] = useState<CashFlowView>("realizado")
  const [balanceSource, setBalanceSource] = useState<string>("none")
  const [lastKnownBalance, setLastKnownBalance] = useState<number | null>(null)
  const [balanceFetchedAt, setBalanceFetchedAt] = useState<string | null>(null)
  const [revenueProjection, setRevenueProjection] = useState<{
    totalAppointments: number; grossRevenue: number; cancellationRate: number;
    projectedRevenue: number; totalEstimatedRepasse: number; actualRevenue: number;
  } | null>(null)
  const [taxEstimate, setTaxEstimate] = useState<{
    regime: string; totalTax: number; effectiveRate: number;
    monthlyTotal: number; quarterlyTotal: number; quarterlyDueThisMonth: boolean;
    nextQuarterlyDueMonth?: number;
    breakdown: { name: string; amount: number; rate: number; period: string }[];
  } | null>(null)
  const [projectedExpenses, setProjectedExpenses] = useState<number>(0)
  const [todayDivider, setTodayDivider] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const loadData = useCallback(async () => {
    // Use the month/year from the top bar filter
    // Realizado: uses the selected period as-is (only confirmed/paid data)
    // Projetado: from selected period forward 90 days (includes open + recurring projections)
    let startDate: string
    let endDate: string

    // Both modes use the same date window from the month/year filter.
    // The difference is what data is included (realizado = paid only, projetado = includes projections).
    if (month) {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 0) // last day of month
      startDate = start.toISOString().split("T")[0]
      endDate = end.toISOString().split("T")[0]
    } else {
      startDate = `${year}-01-01`
      endDate = `${year}-12-31`
    }

    const params = new URLSearchParams({ startDate, endDate, granularity, mode: cashFlowView })

    try {
      const res = await fetch(`/api/financeiro/cashflow?${params}`)
      if (!res.ok) {
        console.error("Cashflow API error:", res.status, await res.text())
        setLoaded(true)
        return
      }
      const data = await res.json()
      setEntries(data.entries)
      setSummary(data.summary)
      setAlerts(data.alerts)
      setBalanceSource(data.balanceSource)
      setLastKnownBalance(data.lastKnownBalance)
      setBalanceFetchedAt(data.balanceFetchedAt)
      setRevenueProjection(data.revenueProjection ?? null)
      setTaxEstimate(data.taxEstimate ?? null)
      setProjectedExpenses(data.projectedExpenses ?? 0)
      setTodayDivider(data.todayDivider ?? null)
    } catch (err) {
      console.error("Cashflow fetch error:", err)
    }
    setLoaded(true)
  }, [year, month, granularity, cashFlowView])

  useEffect(() => { loadData() }, [loadData])

  // Auto-select granularity based on period
  useEffect(() => {
    if (month) {
      setGranularity("daily")
    } else {
      setGranularity("monthly")
    }
  }, [month])

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
              alert.type === "NEGATIVE_BALANCE" ? "bg-red-50 text-red-800 border border-red-200" :
              alert.type === "LARGE_UPCOMING_EXPENSE" ? "bg-amber-50 text-amber-800 border border-amber-200" :
              "bg-orange-50 text-orange-800 border border-orange-200"
            }`}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <CashFlowControls
        cashFlowView={cashFlowView}
        setCashFlowView={setCashFlowView}
        granularity={granularity}
        setGranularity={setGranularity}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* Bank Balance + Summary Cards */}
      {summary && (
        <CashFlowSummary
          summary={summary}
          balanceSource={balanceSource}
          balanceFetchedAt={balanceFetchedAt}
          lastKnownBalance={lastKnownBalance}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Projection Breakdown (projetado mode only) */}
      {cashFlowView === "projetado" && revenueProjection && (
        <ProjectionBreakdown
          revenueProjection={revenueProjection}
          taxEstimate={taxEstimate}
          projectedExpenses={projectedExpenses}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Chart or Table */}
      {viewMode === "chart" ? (
        <CashFlowChart entries={entries} granularity={granularity} todayDivider={cashFlowView === "projetado" ? todayDivider : null} />
      ) : (
        <CashFlowTable entries={entries} granularity={granularity} todayDivider={cashFlowView === "projetado" ? todayDivider : null} />
      )}
    </div>
  )
}
