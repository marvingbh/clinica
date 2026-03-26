import { Check, Clock, Calendar } from "lucide-react"

interface ScheduledPayment {
  codigoTransacao: string
  dataVencimento: string
  valor: number
  descricao: string
  alreadyImported: boolean
  suggestion: { categoryId: string | null; categoryName: string | null; supplierName: string | null; confidence: string } | null
}

interface ScheduledPaymentsProps {
  payments: ScheduledPayment[]
  creating: string | null
  importingAll: boolean
  onImport: (payment: ScheduledPayment) => void
  onImportAll: () => void
  formatCurrency: (value: number | string) => string
  formatDate: (dateStr: string) => string
  confidenceLabel: (c: string) => { text: string; className: string }
}

export function ScheduledPayments({
  payments, creating, importingAll,
  onImport, onImportAll, formatCurrency, formatDate, confidenceLabel,
}: ScheduledPaymentsProps) {
  if (payments.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-amber-600" />
          Pagamentos Agendados ({payments.length})
        </h3>
        <button
          onClick={onImportAll}
          disabled={importingAll}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
        >
          <Calendar className="h-3.5 w-3.5" />
          {importingAll ? "Importando..." : "Importar Todos"}
        </button>
      </div>
      {payments.map((p) => (
        <div key={p.codigoTransacao} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">{formatDate(p.dataVencimento)}</span>
              <span className="text-lg font-semibold text-amber-700">{formatCurrency(p.valor)}</span>
            </div>
            <p className="text-sm text-muted-foreground truncate">{p.descricao}</p>
            {p.suggestion && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceLabel(p.suggestion.confidence).className}`}>
                {p.suggestion.categoryName ?? "Sem categoria"}
              </span>
            )}
          </div>
          <button
            onClick={() => onImport(p)}
            disabled={creating === p.codigoTransacao}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 shrink-0"
          >
            <Check className="h-3.5 w-3.5" />
            {creating === p.codigoTransacao ? "Importando..." : "Criar Despesa"}
          </button>
        </div>
      ))}
    </div>
  )
}
