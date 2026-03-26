"use client"

import { useState, useCallback } from "react"
import { AlertTriangle } from "lucide-react"
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
  const [entries, setEntries] = useState<Entry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([])
  const [granularity, setGranularity] = useState<Granularity>("weekly")
  const [period, setPeriod] = useState(90)
  const [startingBalance, setStartingBalance] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("chart")
  const [loaded, setLoaded] = useState(false)

  const loadData = useCallback(async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getTime() + period * 24 * 60 * 60 * 1000)

    const params = new URLSearchParams({
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
      granularity,
    })
    if (startingBalance) params.set("startingBalance", startingBalance)

    const res = await fetch(`/api/financeiro/cashflow?${params}`)
    if (res.ok) {
      const data = await res.json()
      setEntries(data.entries)
      setSummary(data.summary)
      setAlerts(data.alerts)
    }
    setLoaded(true)
  }, [granularity, period, startingBalance])

  useState(() => { loadData() })

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
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Granularidade</label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {(["daily", "weekly", "monthly"] as const).map((g) => (
              <button
                key={g}
                onClick={() => { setGranularity(g); setTimeout(loadData, 0) }}
                className={`px-3 py-1.5 text-xs ${granularity === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {g === "daily" ? "Diário" : g === "weekly" ? "Semanal" : "Mensal"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Período</label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {[30, 60, 90].map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setTimeout(loadData, 0) }}
                className={`px-3 py-1.5 text-xs ${period === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {p} dias
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Saldo inicial (R$)</label>
          <input
            type="number"
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
            onBlur={() => loadData()}
            placeholder="0,00"
            className="w-32 rounded-md border border-input px-3 py-1.5 text-xs"
          />
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
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <p className="text-xs text-muted-foreground">Saldo projetado</p>
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
