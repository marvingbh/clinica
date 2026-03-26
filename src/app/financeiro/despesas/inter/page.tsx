"use client"

import { RefreshCw, CheckCircle2, Clock } from "lucide-react"
import { ScheduledPayments } from "./components/ScheduledPayments"
import { UnmatchedTransactions } from "./components/UnmatchedTransactions"
import { ReconcileSuggestions } from "./components/ReconcileSuggestions"
import { useInterImport } from "./useInterImport"

const formatCurrency = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("pt-BR", { timeZone: "UTC" })

const confidenceLabel = (c: string) => {
  if (c === "HIGH") return { text: "Alta", className: "bg-green-100 text-green-700" }
  if (c === "MEDIUM") return { text: "Média", className: "bg-yellow-100 text-yellow-700" }
  return { text: "Baixa", className: "bg-gray-100 text-gray-600" }
}

export default function InterImportPage() {
  const {
    transactions, autoReconciled, suggestions, scheduledPayments,
    loaded, fetching, creating, importingScheduled,
    handleFetchFromInter, handleFetchScheduled,
    handleImportScheduled, handleImportAllScheduled,
    handleCreateExpense, handleCreateWithRecurrence,
    handleConfirmSuggestion, handleDismiss,
  } = useInterImport()

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Importar Despesas do Inter</h2>
        <button
          onClick={handleFetchFromInter}
          disabled={fetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
          {fetching ? "Buscando..." : "Buscar Transações"}
        </button>
        <button
          onClick={handleFetchScheduled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          <Clock className="h-4 w-4" /> Agendamentos
        </button>
      </div>

      {autoReconciled.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{autoReconciled.length} despesa(s) recorrente(s) reconciliada(s) automaticamente</span>
        </div>
      )}

      <ReconcileSuggestions suggestions={suggestions} onConfirm={handleConfirmSuggestion} />

      <ScheduledPayments
        payments={scheduledPayments}
        creating={creating}
        importingAll={importingScheduled}
        onImport={handleImportScheduled}
        onImportAll={handleImportAllScheduled}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        confidenceLabel={confidenceLabel}
      />

      <UnmatchedTransactions
        transactions={transactions}
        creating={creating}
        onCreateExpense={handleCreateExpense}
        onCreateWithRecurrence={handleCreateWithRecurrence}
        onDismiss={handleDismiss}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        confidenceLabel={confidenceLabel}
      />
    </div>
  )
}
