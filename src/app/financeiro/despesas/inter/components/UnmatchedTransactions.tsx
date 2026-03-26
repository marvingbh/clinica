import { Building2, Check, X, Repeat } from "lucide-react"

interface DebitTransaction {
  id: string
  date: string
  amount: number
  description: string
  suggestion: {
    categoryId: string | null
    categoryName: string | null
    supplierName: string | null
    confidence: string
  } | null
}

interface UnmatchedTransactionsProps {
  transactions: DebitTransaction[]
  creating: string | null
  onCreateExpense: (tx: DebitTransaction) => void
  onCreateWithRecurrence: (tx: DebitTransaction) => void
  onDismiss: (txId: string) => void
  formatCurrency: (value: number | string) => string
  formatDate: (dateStr: string) => string
  confidenceLabel: (c: string) => { text: string; className: string }
}

export function UnmatchedTransactions({
  transactions, creating,
  onCreateExpense, onCreateWithRecurrence, onDismiss,
  formatCurrency, formatDate, confidenceLabel,
}: UnmatchedTransactionsProps) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Transações de débito não vinculadas. Crie uma despesa avulsa ou recorrente.
      </p>

      {transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>Nenhuma transação de débito pendente</p>
          <p className="text-xs mt-1">Clique em &quot;Buscar Transações&quot; para importar do Inter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{formatDate(tx.date)}</span>
                  <span className="text-lg font-semibold text-red-600">{formatCurrency(tx.amount)}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate" title={tx.description}>
                  {tx.description}
                </p>
                {tx.suggestion && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceLabel(tx.suggestion.confidence).className}`}>
                      {tx.suggestion.categoryName ?? "Sem categoria"} — {confidenceLabel(tx.suggestion.confidence).text}
                    </span>
                    {tx.suggestion.supplierName && (
                      <span className="text-xs text-muted-foreground">
                        Fornecedor: {tx.suggestion.supplierName}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => onCreateWithRecurrence(tx)}
                  disabled={creating === tx.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                >
                  <Repeat className="h-3.5 w-3.5" /> Recorrente
                </button>
                <button
                  onClick={() => onCreateExpense(tx)}
                  disabled={creating === tx.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Avulsa
                </button>
                <button
                  onClick={() => onDismiss(tx.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  <X className="h-3.5 w-3.5" /> Ignorar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
