"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import {
  Loader2Icon,
  WifiIcon,
  CheckCircle2Icon,
  XCircleIcon,
  DownloadCloudIcon,
} from "lucide-react"
import { IntegrationForm } from "./components/IntegrationForm"
import { TransactionList } from "./components/TransactionList"
import type { Transaction } from "./components/types"

interface Integration {
  id: string
  clientId: string
  accountNumber: string | null
  isActive: boolean
}

type ConnectionStatus = "idle" | "testing" | "ok" | "error"

export default function ConciliacaoPage() {
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingIntegration, setLoadingIntegration] = useState(true)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [lastFetch, setLastFetch] = useState<{ fetched: number; newTransactions: number } | null>(null)
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle")
  const [showReconciled, setShowReconciled] = useState(false)

  // Date range — default: 1st of current month to today
  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)

  const fetchIntegration = useCallback(async () => {
    setLoadingIntegration(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/integration")
      const data = await res.json()
      setIntegration(data.integration || null)
    } finally {
      setLoadingIntegration(false)
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true)
    try {
      const params = showReconciled ? "?showReconciled=true" : ""
      const res = await fetch(`/api/financeiro/conciliacao/transactions${params}`)
      const data = await res.json()
      setTransactions(data.transactions || [])
    } finally {
      setLoadingTransactions(false)
    }
  }, [showReconciled])

  useEffect(() => {
    fetchIntegration()
    fetchTransactions()
  }, [fetchIntegration, fetchTransactions])

  const handleTestConnection = async () => {
    setConnStatus("testing")
    try {
      const res = await fetch("/api/financeiro/conciliacao/test-auth", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha")
      setConnStatus("ok")
      toast.success(data.message)
    } catch (err) {
      setConnStatus("error")
      toast.error(err instanceof Error ? err.message : "Erro ao testar conexão")
    }
  }

  const handleFetch = async () => {
    setFetching(true)
    setLastFetch(null)
    try {
      const res = await fetch("/api/financeiro/conciliacao/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao buscar transações")
      }
      const data = await res.json()
      setLastFetch({ fetched: data.fetched, newTransactions: data.newTransactions })
      setConnStatus("ok")
      toast.success(`${data.newTransactions} nova(s) transação(ões) importada(s)`)
      fetchTransactions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar transações")
    } finally {
      setFetching(false)
    }
  }

  if (loadingIntegration) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="space-y-4">
      <IntegrationForm existing={integration} onSaved={fetchIntegration} />

      {integration && (
        <>
          {/* Unified control bar */}
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            <div className="flex items-center flex-wrap gap-y-0 divide-x divide-border">
              {/* Connection status */}
              <button
                onClick={handleTestConnection}
                disabled={connStatus === "testing"}
                className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted/40 transition-colors disabled:opacity-60"
              >
                {connStatus === "testing" ? (
                  <Loader2Icon className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : connStatus === "ok" ? (
                  <CheckCircle2Icon className="w-4 h-4 text-green-500" />
                ) : connStatus === "error" ? (
                  <XCircleIcon className="w-4 h-4 text-red-500" />
                ) : (
                  <WifiIcon className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  {connStatus === "testing" ? "Testando..." :
                   connStatus === "ok" ? "Conectado" :
                   connStatus === "error" ? "Falha" :
                   "Testar"}
                </span>
              </button>

              {/* Date range */}
              <div className="flex items-center gap-2 px-4 py-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="px-2 py-1 border border-border rounded bg-background text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="px-2 py-1 border border-border rounded bg-background text-sm tabular-nums"
                />
              </div>

              {/* Fetch button */}
              <button
                onClick={handleFetch}
                disabled={fetching}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-60 ml-auto"
              >
                {fetching ? (
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadCloudIcon className="w-4 h-4" />
                )}
                {fetching ? "Importando..." : "Buscar Extrato"}
              </button>
            </div>

            {/* Result bar */}
            {lastFetch && (
              <div className="px-4 py-1.5 bg-muted/30 border-t border-border text-xs text-muted-foreground">
                {lastFetch.fetched} recebimento(s) encontrado(s), {lastFetch.newTransactions} novo(s) importado(s)
              </div>
            )}
          </div>

          {/* Transactions */}
          {loadingTransactions ? (
            <div className="animate-pulse text-muted-foreground text-sm">Carregando transações...</div>
          ) : (
            <TransactionList
              transactions={transactions}
              onReconciled={fetchTransactions}
              showReconciled={showReconciled}
              onToggleReconciled={() => setShowReconciled(v => !v)}
            />
          )}
        </>
      )}
    </div>
  )
}
