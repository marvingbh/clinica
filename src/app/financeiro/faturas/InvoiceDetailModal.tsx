"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { XIcon, PencilIcon, TrashIcon } from "@/shared/components/ui/icons"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { toast } from "sonner"

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: string
  total: string
  type: string
  appointment?: { scheduledAt: string; status: string } | null
}

interface InvoiceDetail {
  id: string
  totalSessions: number
  creditsApplied: number
  totalAmount: string
  patient: { name: string }
  professionalProfile: { user: { name: string } }
  items: InvoiceItem[]
}

interface InvoiceDetailModalProps {
  invoiceId: string
  onClose: () => void
  onUpdate?: () => void
}

export function InvoiceDetailModal({ invoiceId, onClose, onUpdate }: InvoiceDetailModalProps) {
  const [data, setData] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/financeiro/faturas/${invoiceId}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [invoiceId])

  function startEditing(item: InvoiceItem) {
    setEditingId(item.id)
    setEditValue(item.description)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function saveDescription(itemId: string) {
    const original = data?.items.find(i => i.id === itemId)
    if (!original || editValue.trim() === original.description) {
      setEditingId(null)
      return
    }
    const res = await fetch(`/api/financeiro/faturas/${invoiceId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: editValue.trim() }),
    })
    if (res.ok) {
      setData(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === itemId ? { ...i, description: editValue.trim() } : i),
      } : prev)
      toast.success("Descrição atualizada")
    } else {
      toast.error("Erro ao atualizar descrição")
    }
    setEditingId(null)
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Remover este item da fatura?")) return
    setDeletingId(itemId)
    const res = await fetch(`/api/financeiro/faturas/${invoiceId}/items/${itemId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      // Re-fetch to get updated totals from server
      const updated = await fetch(`/api/financeiro/faturas/${invoiceId}`).then(r => r.json())
      setData(updated)
      onUpdate?.()
      toast.success("Item removido")
    } else {
      toast.error("Erro ao remover item")
    }
    setDeletingId(null)
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && !editingId) onClose()
  }, [onClose, editingId])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {loading ? "Carregando..." : `Detalhes - ${data?.patient.name}`}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <div className="animate-pulse text-muted-foreground py-8 text-center">Carregando itens...</div>
          ) : data ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 font-medium">Data</th>
                    <th className="text-left py-2 font-medium">Descrição</th>
                    <th className="text-center py-2 font-medium">Qtd</th>
                    <th className="text-right py-2 font-medium">Valor</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => (
                    <tr key={item.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 text-muted-foreground">
                        {item.appointment?.scheduledAt
                          ? formatDateBR(item.appointment.scheduledAt)
                          : "—"}
                      </td>
                      <td className="py-2">
                        {editingId === item.id ? (
                          <input
                            ref={inputRef}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveDescription(item.id)}
                            onKeyDown={e => {
                              if (e.key === "Enter") saveDescription(item.id)
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            className="w-full px-2 py-1 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        ) : (
                          item.description
                        )}
                      </td>
                      <td className="py-2 text-center">{item.quantity}</td>
                      <td className="py-2 text-right">{formatCurrencyBRL(Number(item.unitPrice))}</td>
                      <td className="py-2 text-right font-medium">{formatCurrencyBRL(Number(item.total))}</td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          {editingId !== item.id && (
                            <button
                              onClick={() => startEditing(item)}
                              className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Editar descrição"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteItem(item.id)}
                            disabled={deletingId === item.id}
                            className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                            title="Remover item"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div className="mt-4 pt-3 border-t border-border flex justify-end">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-8">
                    <span className="text-muted-foreground">Sessões</span>
                    <span className="font-medium">{data.totalSessions}</span>
                  </div>
                  {data.creditsApplied > 0 && (
                    <div className="flex justify-between gap-8">
                      <span className="text-muted-foreground">Créditos</span>
                      <span className="font-medium">{data.creditsApplied}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-8 pt-1 border-t border-border">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">{formatCurrencyBRL(Number(data.totalAmount))}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Fatura não encontrada</div>
          )}
        </div>
      </div>
    </div>
  )
}
