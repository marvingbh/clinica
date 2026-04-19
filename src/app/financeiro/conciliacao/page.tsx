"use client"

import { useState, useCallback } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useMountEffect } from "@/shared/hooks"
import { toast } from "sonner"
import { IntegrationForm } from "./components/IntegrationForm"
import { ConciliacaoV1 } from "./components/ConciliacaoV1"
import type { Transaction } from "./components/types"

interface Integration {
  id: string
  clientId: string
  accountNumber: string | null
  isActive: boolean
}

export default function ConciliacaoPage() {
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingIntegration, setLoadingIntegration] = useState(true)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [lastFetch, setLastFetch] = useState<{ fetched: number; newTransactions: number } | null>(
    null
  )
  const [showReconciled, setShowReconciled] = useState(false)

  // Date range — default: 1st of current month to today
  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0]
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

  const fetchTransactions = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingTransactions(true)
      try {
        const params = showReconciled ? "?showReconciled=true" : ""
        const res = await fetch(`/api/financeiro/conciliacao/transactions${params}`)
        const data = await res.json()
        setTransactions(data.transactions || [])
      } finally {
        setLoadingTransactions(false)
      }
    },
    [showReconciled]
  )

  useMountEffect(() => {
    fetchIntegration()
  })


  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

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
      const totalFetched = (data.creditsFetched ?? 0) + (data.debitsFetched ?? 0)
      const totalNew = (data.newCredits ?? 0) + (data.newDebits ?? 0)
      setLastFetch({ fetched: totalFetched, newTransactions: totalNew })
      toast.success(`${totalNew} nova(s) transação(ões) importada(s)`)
      fetchTransactions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar transações")
    } finally {
      setFetching(false)
    }
  }

  if (loadingIntegration) {
    return <div className="animate-pulse text-ink-500">Carregando...</div>
  }

  if (!integration) {
    return (
      <div className="space-y-4">
        <IntegrationForm existing={null} onSaved={fetchIntegration} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <IntegrationForm existing={integration} onSaved={fetchIntegration} />

      {loadingTransactions ? (
        <div className="animate-pulse text-ink-500 text-[13px]">Carregando transações...</div>
      ) : (
        <ConciliacaoV1
          transactions={transactions}
          onReconciled={() => fetchTransactions(true)}
          onFetchExtract={handleFetch}
          lastFetch={lastFetch}
          fetching={fetching}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          showReconciled={showReconciled}
          onToggleReconciled={() => setShowReconciled((v) => !v)}
        />
      )}
    </div>
  )
}
