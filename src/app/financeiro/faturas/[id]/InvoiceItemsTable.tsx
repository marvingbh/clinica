"use client"

import React, { useState } from "react"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import {
  getAttributionLayout,
  enrichItemDescription,
} from "@/lib/financeiro/professional-attribution"
import { toast } from "sonner"
import type { InvoiceDetail, InvoiceItem } from "./types"

const ITEM_TYPE_OPTIONS = [
  { value: "SESSAO_EXTRA", label: "Sessão Extra" },
  { value: "REUNIAO_ESCOLA", label: "Reunião Escola" },
  { value: "CREDITO", label: "Crédito (desconto)" },
]

interface InvoiceItemsTableProps {
  invoice: InvoiceDetail
  isEditable: boolean
  onRefresh: () => void
}

export default function InvoiceItemsTable({ invoice, isEditable, onRefresh }: InvoiceItemsTableProps) {
  // Edit state
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editDescription, setEditDescription] = useState("")
  const [editQuantity, setEditQuantity] = useState(1)
  const [editPrice, setEditPrice] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  // Add item form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItemType, setNewItemType] = useState("SESSAO_EXTRA")
  const [newItemDescription, setNewItemDescription] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState(1)
  const [newItemPrice, setNewItemPrice] = useState("")
  const [addingItem, setAddingItem] = useState(false)

  function startEdit(item: InvoiceItem) {
    setEditingItemId(item.id)
    setEditDescription(item.description)
    setEditQuantity(item.quantity)
    setEditPrice(String(Math.abs(Number(item.unitPrice))))
  }

  function cancelEdit() {
    setEditingItemId(null)
  }

  async function handleSaveEdit() {
    if (!editingItemId) return
    const price = parseFloat(editPrice)
    if (!editDescription.trim() || isNaN(price) || price <= 0) {
      toast.error("Preencha descrição e valor")
      return
    }

    setSavingEdit(true)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/items/${editingItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editDescription.trim(),
        quantity: editQuantity,
        unitPrice: price,
      }),
    })

    if (res.ok) {
      toast.success("Item atualizado")
      setEditingItemId(null)
      onRefresh()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao atualizar item")
    }
    setSavingEdit(false)
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Remover este item da fatura?")) return

    setDeletingItemId(itemId)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/items/${itemId}`, {
      method: "DELETE",
    })

    if (res.ok) {
      toast.success("Item removido")
      onRefresh()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao remover item")
    }
    setDeletingItemId(null)
  }

  async function handleAddItem() {
    const price = parseFloat(newItemPrice)
    if (!newItemDescription.trim() || isNaN(price) || price <= 0) {
      toast.error("Preencha descrição e valor")
      return
    }

    setAddingItem(true)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: newItemType,
        description: newItemDescription.trim(),
        quantity: newItemQuantity,
        unitPrice: price,
      }),
    })

    if (res.ok) {
      toast.success("Item adicionado")
      setShowAddForm(false)
      setNewItemType("SESSAO_EXTRA")
      setNewItemDescription("")
      setNewItemQuantity(1)
      setNewItemPrice(invoice.patient.sessionFee ? String(Number(invoice.patient.sessionFee)) : "")
      onRefresh()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao adicionar item")
    }
    setAddingItem(false)
  }

  return (
    <>
      {/* Items table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left py-3 px-4 font-medium">Descrição</th>
              <th className="text-center py-3 px-4 font-medium">Data</th>
              <th className="text-center py-3 px-4 font-medium">Qtd</th>
              <th className="text-right py-3 px-4 font-medium">Valor Unit.</th>
              <th className="text-right py-3 px-4 font-medium">Total</th>
              {isEditable && <th className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {renderItemsBody({
              items: invoice.items,
              referenceProfessionalName: invoice.patient.referenceProfessional?.user.name ?? null,
              invoiceProfessionalName: invoice.professionalProfile.user.name,
              isEditable,
              editingItemId,
              editDescription,
              setEditDescription,
              editQuantity,
              setEditQuantity,
              editPrice,
              setEditPrice,
              handleSaveEdit,
              savingEdit,
              cancelEdit,
              startEdit,
              handleDeleteItem,
              deletingItemId,
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <td colSpan={4} className="py-3 px-4 text-right">Total</td>
              <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(invoice.totalAmount))}</td>
              {isEditable && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add item */}
      {isEditable && (
        <div>
          {!showAddForm ? (
            <button
              onClick={() => {
                const fee = invoice.patient.sessionFee ? String(Number(invoice.patient.sessionFee)) : ""
                setNewItemPrice(fee)
                setShowAddForm(true)
              }}
              className="px-4 py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              + Adicionar item manual
            </button>
          ) : (
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
              <h4 className="text-sm font-semibold">Adicionar Item</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Tipo</label>
                  <select
                    value={newItemType}
                    onChange={e => setNewItemType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  >
                    {ITEM_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Descrição</label>
                  <input
                    type="text"
                    value={newItemDescription}
                    onChange={e => setNewItemDescription(e.target.value)}
                    placeholder="Ex: Sessão extra 15/02"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Qtd</label>
                  <input
                    type="number"
                    min={1}
                    value={newItemQuantity}
                    onChange={e => setNewItemQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valor Unit. (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemPrice}
                    onChange={e => setNewItemPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddItem}
                  disabled={addingItem}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addingItem ? "Adicionando..." : "Adicionar"}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

interface RenderItemsBodyProps {
  items: InvoiceItem[]
  referenceProfessionalName: string | null
  invoiceProfessionalName: string
  isEditable: boolean
  editingItemId: string | null
  editDescription: string
  setEditDescription: (v: string) => void
  editQuantity: number
  setEditQuantity: (v: number) => void
  editPrice: string
  setEditPrice: (v: string) => void
  handleSaveEdit: () => void
  savingEdit: boolean
  cancelEdit: () => void
  startEdit: (item: InvoiceItem) => void
  handleDeleteItem: (id: string) => void
  deletingItemId: string | null
}

function renderItemsBody(p: RenderItemsBodyProps): React.ReactNode {
  const sortedItems = [...p.items].sort((a, b) => {
    const dateA = a.appointment?.scheduledAt ?? ""
    const dateB = b.appointment?.scheduledAt ?? ""
    return dateA.localeCompare(dateB)
  })

  const layout = getAttributionLayout({
    items: sortedItems.map(it => ({
      appointmentId: it.appointment?.id ?? null,
      type: it.type,
      attendingProfessionalId: it.attendingProfessional?.id ?? null,
      attendingProfessionalName: it.attendingProfessional?.user.name ?? null,
    })),
    referenceProfessionalName: p.referenceProfessionalName,
    invoiceProfessionalName: p.invoiceProfessionalName,
  })

  const colSpan = p.isEditable ? 6 : 5

  const renderRow = (item: InvoiceItem) => {
    const isCredit = item.type === "CREDITO"
    const isEditing = p.editingItemId === item.id
    const description = enrichItemDescription(
      {
        type: item.type,
        baseDescription: item.description,
        groupName: item.appointment?.group?.name ?? null,
      },
      { includeGroupName: true },
    )
    if (isEditing) {
      return (
        <tr key={item.id} className="border-b border-border last:border-0 bg-yellow-50">
          <td className="py-2 px-4">
            <input
              type="text"
              value={p.editDescription}
              onChange={e => p.setEditDescription(e.target.value)}
              className="w-full px-2 py-1 rounded border border-border bg-background text-sm"
            />
          </td>
          <td className="text-center py-2 px-4 text-muted-foreground">
            {item.appointment ? new Date(item.appointment.scheduledAt).toLocaleDateString("pt-BR") : "—"}
          </td>
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
      <tr key={item.id} className={`border-b border-border last:border-0 ${isCredit ? "text-red-600" : ""}`}>
        <td className="py-3 px-4">{description}</td>
        <td className="text-center py-3 px-4 text-muted-foreground">
          {item.appointment ? new Date(item.appointment.scheduledAt).toLocaleDateString("pt-BR") : "—"}
        </td>
        <td className="text-center py-3 px-4">{item.quantity}</td>
        <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(item.unitPrice))}</td>
        <td className="text-right py-3 px-4 font-medium">{formatCurrencyBRL(Number(item.total))}</td>
        {p.isEditable && (
          <td className="py-3 px-2">
            <div className="flex gap-1">
              <button
                onClick={() => p.startEdit(item)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
                title="Editar item"
              >
                ✎
              </button>
              <button
                onClick={() => p.handleDeleteItem(item.id)}
                disabled={p.deletingItemId === item.id}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                title="Remover item"
              >
                {p.deletingItemId === item.id ? "..." : "✕"}
              </button>
            </div>
          </td>
        )}
      </tr>
    )
  }

  if (layout.mode === "single") {
    return sortedItems.map(item => renderRow(item))
  }

  // Multi mode: walk sections, emit divider rows + their items.
  const usedIds = new Set<string>()
  return layout.sections.flatMap((section, sIdx) => {
    const rows: React.ReactNode[] = []
    if (section.header) {
      rows.push(
        <tr key={`section-${sIdx}`} className="bg-muted/30">
          <td colSpan={colSpan} className="py-2 px-4 text-xs font-semibold uppercase text-muted-foreground tracking-wide">
            {section.header}
          </td>
        </tr>,
      )
    }
    for (const li of section.items) {
      const target = sortedItems.find(s =>
        !usedIds.has(s.id)
        && s.type === li.type
        && (s.appointment?.id ?? null) === li.appointmentId
      )
      if (target) {
        usedIds.add(target.id)
        rows.push(renderRow(target))
      }
    }
    return rows
  })
}
