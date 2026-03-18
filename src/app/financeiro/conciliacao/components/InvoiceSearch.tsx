"use client"

import { useState, useCallback, useRef } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { CheckIcon, SearchIcon, Loader2Icon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR, getMonthNameShort } from "@/lib/financeiro/format"
import { INVOICE_STATUS_CONFIG } from "./types"

interface SearchResult {
  invoiceId: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  status?: string
  totalAmount: number
  remainingAmount?: number
  referenceMonth: number
  referenceYear: number
  dueDate: string | null
}

interface InvoiceSearchProps {
  selectedInvoiceId?: string | null
  selectedIds?: string[]
  onSelect: (invoiceId: string, amount?: number) => void
}

export function InvoiceSearch({ selectedInvoiceId, selectedIds, onSelect }: InvoiceSearchProps) {
  const [query, setQuery] = useState("")
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const search = useCallback(async (q: string, m: number, y: number) => {
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ q, month: String(m), year: String(y) })
      const res = await fetch(`/api/financeiro/conciliacao/search-invoices?${params}`)
      const data = await res.json()
      setResults(data.invoices || [])
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value, month, year), 400)
  }

   
  useEffect(() => {
    if (query.length >= 2) {
      search(query, month, year)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year])

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Nome do paciente..."
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-sm border border-border rounded-md bg-background"
          />
        </div>
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-background"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{getMonthNameShort(i + 1)}</option>
          ))}
        </select>
        <input
          type="number"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="w-20 px-2 py-1.5 text-sm border border-border rounded-md bg-background"
        />
        {loading && <Loader2Icon className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {results.length > 0 && (
        <div className="border border-border rounded-md divide-y divide-border">
          {results.map(inv => {
            const isSelected = selectedIds
              ? selectedIds.includes(inv.invoiceId)
              : selectedInvoiceId === inv.invoiceId
            return (
              <button
                key={inv.invoiceId}
                onClick={() => onSelect(inv.invoiceId, inv.remainingAmount ?? inv.totalAmount)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? "bg-primary/8 ring-2 ring-inset ring-primary/30"
                    : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-4 h-4 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  }`}>
                    {isSelected && <CheckIcon className="w-3 h-3" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{inv.patientName}</span>
                      {inv.status && INVOICE_STATUS_CONFIG[inv.status] && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${INVOICE_STATUS_CONFIG[inv.status].bg}`}>
                          {INVOICE_STATUS_CONFIG[inv.status].label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs">
                      {inv.dueDate ? (
                        <span className="text-muted-foreground">
                          {formatDateBR(inv.dueDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {getMonthNameShort(inv.referenceMonth)}/{inv.referenceYear}
                        </span>
                      )}
                      <span className="font-medium tabular-nums">
                        {formatCurrencyBRL(inv.totalAmount)}
                      </span>
                      {inv.status === "PARCIAL" && inv.remainingAmount !== undefined && (
                        <span className="text-orange-600 dark:text-orange-400 tabular-nums">
                          Falta: {formatCurrencyBRL(inv.remainingAmount)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {inv.motherName && <span>Mãe: {inv.motherName}</span>}
                      {inv.fatherName && <span>Pai: {inv.fatherName}</span>}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {searched && results.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">Nenhuma fatura encontrada.</p>
      )}
    </div>
  )
}
