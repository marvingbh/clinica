interface ExpenseTotals {
  open: number
  overdue: number
  paid: number
  total: number
}

interface ExpenseSummaryCardsProps {
  totals: ExpenseTotals
  formatCurrency: (value: string | number) => string
}

export function ExpenseSummaryCards({ totals, formatCurrency }: ExpenseSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Em aberto</p>
        <p className="text-lg font-semibold text-blue-600">{formatCurrency(totals.open)}</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Vencido</p>
        <p className="text-lg font-semibold text-red-600">{formatCurrency(totals.overdue)}</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Pago</p>
        <p className="text-lg font-semibold text-green-600">{formatCurrency(totals.paid)}</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Total</p>
        <p className="text-lg font-semibold">{formatCurrency(totals.total)}</p>
      </div>
    </div>
  )
}
