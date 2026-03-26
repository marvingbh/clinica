"use client"

import { useState, useCallback, useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { useFinanceiroContext } from "../context/FinanceiroContext"
import { CashFlowChart } from "./components/CashFlowChart"
import { CashFlowTable } from "./components/CashFlowTable"
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

export default function FluxoDeCaixaPage() {
  const { year, month } = useFinanceiroContext()
  const [entries, setEntries] = useState<Entry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([])
  const [granularity, setGranularity] = useState<Granularity>("daily")
  const [viewMode, setViewMode] = useState<ViewMode>("chart")
  const [balanceSource, setBalanceSource] = useState<string>("none")
  const [balanceFetchedAt, setBalanceFetchedAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const loadData = useCallback(async () => {
    // Use the month/year from the top bar filter
    // If month is selected: show that specific month
    // If no month (full year): show the entire year
    let startDate: string
    let endDate: string

    if (month) {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 0) // last day of month
      startDate = start.toISOString().split("T")[0]
      endDate = end.toISOString().split("T")[0]
    } else {
      startDate = `${year}-01-01`
      endDate = `${year}-12-31`
    }

    const params = new URLSearchParams({ startDate, endDate, granularity })

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
      setBalanceFetchedAt(data.balanceFetchedAt)
    } catch (err) {
      console.error("Cashflow fetch error:", err)
    }
    setLoaded(true)
  }, [year, month, granularity])

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

  const now = new Date()
  const isCurrentOrFuture = month
    ? (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1))
    : year >= now.getFullYear()

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
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Granularidade</label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {(["daily", "weekly", "monthly"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 text-xs ${granularity === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {g === "daily" ? "Diário" : g === "weekly" ? "Semanal" : "Mensal"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Visualização</label>
          <div className="flex rounded-md border border-input overflow-hidden">
            <button
              onClick={() => setViewMode("chart")}
              className={`px-3 py-1.5 text-xs ${viewMode === "chart" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Gráfico
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 text-xs ${viewMode === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Tabela
            </button>
          </div>
        </div>
        {isCurrentOrFuture && (
          <span className="text-xs text-muted-foreground px-2 py-1 bg-blue-50 rounded border border-blue-200 text-blue-700">
            Inclui projeções de despesas recorrentes e faturas em aberto
          </span>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Saldo inicial
              {balanceSource === "inter" && (
                <span className="text-[10px] ml-1 text-green-600">(Inter)</span>
              )}
            </p>
            <p className="text-lg font-semibold">{formatCurrency(summary.startingBalance)}</p>
            {balanceFetchedAt && balanceSource === "inter" && (
              <p className="text-[10px] text-muted-foreground">
                Atualizado em {new Date(balanceFetchedAt).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-lg font-semibold text-green-600">{formatCurrency(summary.totalInflow)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-lg font-semibold text-red-600">{formatCurrency(summary.totalOutflow)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Fluxo líquido</p>
            <p className={`text-lg font-semibold ${summary.netFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(summary.netFlow)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Saldo final</p>
            <p className={`text-lg font-semibold ${summary.projectedEndBalance >= 0 ? "" : "text-red-600"}`}>
              {formatCurrency(summary.projectedEndBalance)}
            </p>
          </div>
        </div>
      )}

      {/* Chart or Table */}
      {viewMode === "chart" ? (
        <CashFlowChart entries={entries} granularity={granularity} />
      ) : (
        <CashFlowTable entries={entries} granularity={granularity} />
      )}
    </div>
  )
}
