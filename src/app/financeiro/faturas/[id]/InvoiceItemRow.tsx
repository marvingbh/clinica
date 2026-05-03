"use client"

import { formatCurrencyBRL } from "@/lib/financeiro/format"
import type { InvoiceItem } from "./types"

interface InvoiceItemRowProps {
  item: InvoiceItem
  isEditable: boolean
  isEditing: boolean
  // Edit-mode state + handlers (only consulted when isEditing)
  editDescription: string
  setEditDescription: (v: string) => void
  editQuantity: number
  setEditQuantity: (v: number) => void
  editPrice: string
  setEditPrice: (v: string) => void
  savingEdit: boolean
  handleSaveEdit: () => void
  cancelEdit: () => void
  // Read-mode handlers
  startEdit: (item: InvoiceItem) => void
  handleDeleteItem: (id: string) => void
  deletingItemId: string | null
}

export default function InvoiceItemRow(p: InvoiceItemRowProps) {
  const isCredit = p.item.type === "CREDITO"
  const dateCell = p.item.appointment
    ? new Date(p.item.appointment.scheduledAt).toLocaleDateString("pt-BR")
    : "—"

  if (p.isEditing) {
    return (
      <tr className="border-b border-border last:border-0 bg-yellow-50">
        <td className="py-2 px-4">
          <input
            type="text"
            value={p.editDescription}
            onChange={e => p.setEditDescription(e.target.value)}
            className="w-full px-2 py-1 rounded border border-border bg-background text-sm"
          />
        </td>
        <td className="text-center py-2 px-4 text-muted-foreground">{dateCell}</td>
        <td className="text-center py-2 px-4">
          <input
            type="number"
            min={1}
            value={p.editQuantity}
            onChange={e => p.setEditQuantity(parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-1 rounded border border-border bg-background text-sm text-center"
          />
        </td>
        <td className="text-right py-2 px-4">
          <input
            type="number"
            step="0.01"
            min="0"
            value={p.editPrice}
            onChange={e => p.setEditPrice(e.target.value)}
            className="w-24 px-2 py-1 rounded border border-border bg-background text-sm text-right"
          />
        </td>
        <td className="text-right py-2 px-4 text-muted-foreground text-xs">
          {formatCurrencyBRL((parseFloat(p.editPrice) || 0) * p.editQuantity * (isCredit ? -1 : 1))}
        </td>
        <td className="py-2 px-2">
          <div className="flex gap-1">
            <button
              onClick={p.handleSaveEdit}
              disabled={p.savingEdit}
              className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {p.savingEdit ? "..." : "OK"}
            </button>
            <button
              onClick={p.cancelEdit}
              className="text-xs px-2 py-1 bg-muted text-foreground rounded hover:bg-muted/80"
            >
              ✕
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`border-b border-border last:border-0 ${isCredit ? "text-red-600" : ""}`}>
      <td className="py-3 px-4">{p.item.description}</td>
      <td className="text-center py-3 px-4 text-muted-foreground">{dateCell}</td>
      <td className="text-center py-3 px-4">{p.item.quantity}</td>
      <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(p.item.unitPrice))}</td>
      <td className="text-right py-3 px-4 font-medium">{formatCurrencyBRL(Number(p.item.total))}</td>
      {p.isEditable && (
        <td className="py-3 px-2">
          <div className="flex gap-1">
            <button
              onClick={() => p.startEdit(p.item)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              title="Editar item"
            >
              ✎
            </button>
            <button
              onClick={() => p.handleDeleteItem(p.item.id)}
              disabled={p.deletingItemId === p.item.id}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              title="Remover item"
            >
              {p.deletingItemId === p.item.id ? "..." : "✕"}
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}
