"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { RefreshCwIcon, Loader2Icon } from "lucide-react"
import { IntegrationForm } from "./components/IntegrationForm"
import { TransactionList } from "./components/TransactionList"

interface Integration {
  id: string
  clientId: string
  accountNumber: string | null
  isActive: boolean
}

export default function ConciliacaoPage() {
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [transactions, setTransactions] = useState([])
  const [loadingIntegration, setLoadingIntegration] = useState(true)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [fetching, setFetching] = useState(false)

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
      const res = await fetch("/api/financeiro/conciliacao/transactions")
      const data = await res.json()
      setTransactions(data.transactions || [])
    } finally {
      setLoadingTransactions(false)
    }
  }, [])

  useEffect(() => {
    fetchIntegration()
    fetchTransactions()
  }, [fetchIntegration, fetchTransactions])

  const handleFetch = async () => {
    setFetching(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/fetch", { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao buscar transações")
      }
      const data = await res.json()
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
    <div className="space-y-6">
      <IntegrationForm existing={integration} onSaved={fetchIntegration} />

      {integration && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Transações (últimos 30 dias)</h3>
            <Button onClick={handleFetch} disabled={fetching} size="sm" variant="outlined">
              {fetching ? (
                <Loader2Icon className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <RefreshCwIcon className="w-4 h-4 mr-1" />
              )}
              Buscar Transações
            </Button>
          </div>

          {loadingTransactions ? (
            <div className="animate-pulse text-muted-foreground">Carregando transações...</div>
          ) : (
            <TransactionList
              transactions={transactions}
              onReconciled={fetchTransactions}
            />
          )}
        </>
      )}
    </div>
  )
}
