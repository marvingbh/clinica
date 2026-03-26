interface Summary {
  totalInflow: number
  totalOutflow: number
  netFlow: number
  startingBalance: number
  projectedEndBalance: number
}

interface CashFlowSummaryProps {
  summary: Summary
  balanceSource: string
  balanceFetchedAt: string | null
  lastKnownBalance: number | null
  formatCurrency: (value: number) => string
}

export function CashFlowSummary({
  summary, balanceSource, balanceFetchedAt, lastKnownBalance, formatCurrency,
}: CashFlowSummaryProps) {
  return (
    <>
      {/* Current Bank Balance */}
      {lastKnownBalance !== null && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-green-700 font-medium">Saldo atual — Banco Inter</p>
            <p className="text-2xl font-bold text-green-800">{formatCurrency(lastKnownBalance)}</p>
          </div>
          {balanceFetchedAt && (
            <p className="text-xs text-green-600">
              Atualizado em {new Date(balanceFetchedAt).toLocaleDateString("pt-BR")}{" "}
              às {new Date(balanceFetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      )}

      {/* Summary Cards */}
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
    </>
  )
}
