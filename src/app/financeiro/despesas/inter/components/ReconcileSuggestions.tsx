import { Check } from "lucide-react"

interface Suggestion {
  transactionId: string
  expenseId: string
  amount: number
  reason: string
  transaction: { id: string; date: string; amount: string; description: string } | null
  expense: { id: string; description: string; dueDate: string; amount: string } | null
}

interface ReconcileSuggestionsProps {
  suggestions: Suggestion[]
  onConfirm: (s: Suggestion) => void
}

export function ReconcileSuggestions({ suggestions, onConfirm }: ReconcileSuggestionsProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Sugestões de vínculo</h3>
      {suggestions.map((s) => (
        <div key={s.transactionId} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              <span className="font-medium">{s.transaction?.description}</span>
              {" → "}
              <span className="text-muted-foreground">{s.expense?.description}</span>
            </p>
            <p className="text-xs text-muted-foreground">{s.reason}</p>
          </div>
          <button
            onClick={() => onConfirm(s)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200 shrink-0"
          >
            <Check className="h-3.5 w-3.5" /> Confirmar
          </button>
        </div>
      ))}
    </div>
  )
}
