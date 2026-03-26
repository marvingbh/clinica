"use client"

import { useState } from "react"

interface Transaction {
  externalId: string
  date: string
  amount: number
  description: string
}

interface Suggestion {
  categoryId: string | null
  categoryName: string | null
  supplierName: string | null
  confidence: string
}

interface ParsedResult {
  transaction: Transaction
  suggestion: Suggestion | null
}

interface Props {
  results: ParsedResult[]
  onConfirm: (items: { externalId: string; date: string; amount: number; description: string; categoryId: string | null; supplierName: string | null }[]) => void
  onCancel: () => void
}

export function ImportReviewTable({ results, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(results.map((r) => r.transaction.externalId))
  )
  const [edits, setEdits] = useState<Record<string, { supplierName: string }>>({})

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map((r) => r.transaction.externalId)))
    }
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleConfirm = () => {
    const items = results
      .filter((r) => selected.has(r.transaction.externalId))
      .map((r) => ({
        externalId: r.transaction.externalId,
        date: r.transaction.date,
        amount: r.transaction.amount,
        description: r.transaction.description,
        categoryId: r.suggestion?.categoryId ?? null,
        supplierName: edits[r.transaction.externalId]?.supplierName ?? r.suggestion?.supplierName ?? null,
      }))
    onConfirm(items)
  }

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-")
    return `${d}/${m}/${y}`
  }

  const confidenceColor = (c: string) => {
    if (c === "HIGH") return "bg-green-100 text-green-700"
    if (c === "MEDIUM") return "bg-yellow-100 text-yellow-700"
    return "bg-gray-100 text-gray-600"
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Nenhuma transação nova encontrada</p>
        <button onClick={onCancel} className="mt-3 px-4 py-2 text-sm rounded-md border border-input">
          Voltar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 w-10">
                <input type="checkbox" checked={selected.size === results.length} onChange={toggleAll} />
              </th>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Descrição</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
              <th className="text-left px-3 py-2 font-medium">Categoria sugerida</th>
              <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((r) => (
              <tr key={r.transaction.externalId} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.transaction.externalId)}
                    onChange={() => toggle(r.transaction.externalId)}
                  />
                </td>
                <td className="px-3 py-2">{formatDate(r.transaction.date)}</td>
                <td className="px-3 py-2 max-w-[250px] truncate" title={r.transaction.description}>
                  {r.transaction.description}
                </td>
                <td className="px-3 py-2 text-right font-medium text-red-700">
                  {formatCurrency(r.transaction.amount)}
                </td>
                <td className="px-3 py-2">
                  {r.suggestion ? (
                    <span className="inline-flex items-center gap-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceColor(r.suggestion.confidence)}`}>
                        {r.suggestion.categoryName ?? "—"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    defaultValue={r.suggestion?.supplierName ?? ""}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [r.transaction.externalId]: { supplierName: e.target.value } }))}
                    className="w-full rounded border border-input px-2 py-1 text-xs"
                    placeholder="Fornecedor"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{selected.size} de {results.length} selecionadas</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-input">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Confirmar {selected.size} transações
          </button>
        </div>
      </div>
    </div>
  )
}
