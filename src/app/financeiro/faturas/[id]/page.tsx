"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { toast } from "sonner"

interface InvoiceItem {
  id: string
  type: string
  description: string
  quantity: number
  unitPrice: string
  total: string
  appointment: { id: string; scheduledAt: string; status: string } | null
}

interface InvoiceDetail {
  id: string
  referenceMonth: number
  referenceYear: number
  status: string
  totalSessions: number
  creditsApplied: number
  extrasAdded: number
  totalAmount: string
  dueDate: string
  paidAt: string | null
  notes: string | null
  messageBody: string | null
  notaFiscalEmitida: boolean
  notaFiscalEmitidaAt: string | null
  hasNotaFiscalPdf: boolean
  patient: { id: string; name: string; phone: string; motherName: string | null }
  professionalProfile: { id: string; user: { name: string } }
  items: InvoiceItem[]
  consumedCredits: Array<{ id: string; reason: string; createdAt: string }>
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  ENVIADO: "Enviado",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
}

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  ENVIADO: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAGO: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CANCELADO: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}

const ITEM_TYPE_OPTIONS = [
  { value: "SESSAO_EXTRA", label: "Sessão Extra" },
  { value: "REUNIAO_ESCOLA", label: "Reunião Escola" },
  { value: "CREDITO", label: "Crédito (desconto)" },
]

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)

  // Add item form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItemType, setNewItemType] = useState("SESSAO_EXTRA")
  const [newItemDescription, setNewItemDescription] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState(1)
  const [newItemPrice, setNewItemPrice] = useState("")
  const [addingItem, setAddingItem] = useState(false)

  // Nota fiscal
  const [togglingNf, setTogglingNf] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [deletingPdf, setDeletingPdf] = useState(false)
  const nfFileRef = useRef<HTMLInputElement>(null)

  // Edit/delete
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editDescription, setEditDescription] = useState("")
  const [editQuantity, setEditQuantity] = useState(1)
  const [editPrice, setEditPrice] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const fetchInvoice = useCallback(async () => {
    const res = await fetch(`/api/financeiro/faturas/${params.id}`)
    if (res.ok) {
      const data = await res.json()
      setInvoice(data)
      setNotes(data.notes || "")
    }
  }, [params.id])

  useEffect(() => {
    fetchInvoice().finally(() => setLoading(false))
  }, [fetchInvoice])

  async function handleStatusChange(newStatus: string) {
    if (!invoice || newStatus === invoice.status) return

    const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      toast.success(`Status alterado para ${STATUS_LABELS[newStatus] || newStatus}`)
      setInvoice({
        ...invoice,
        status: newStatus,
        ...(newStatus === "PAGO" ? { paidAt: new Date().toISOString() } : {}),
      })
    } else {
      toast.error("Erro ao alterar status")
    }
  }

  async function handleDelete() {
    if (!invoice) return
    if (!confirm("Excluir esta fatura? Os créditos consumidos serão liberados.")) return
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Fatura excluída")
      router.push("/financeiro/faturas")
    }
  }

  async function handleEnviarWhatsApp() {
    if (!invoice) return
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/enviar`, { method: "POST" })
    const data = await res.json()
    if (res.ok) {
      toast.success("Fatura enviada via WhatsApp")
    } else {
      toast.error(data.error || "Erro ao enviar")
    }
  }

  async function handleToggleNf() {
    if (!invoice) return
    setTogglingNf(true)
    const newValue = !invoice.notaFiscalEmitida
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notaFiscalEmitida: newValue }),
    })
    if (res.ok) {
      toast.success(newValue ? "NF marcada como emitida" : "NF desmarcada")
      await fetchInvoice()
    } else {
      toast.error("Erro ao atualizar NF")
    }
    setTogglingNf(false)
  }

  async function handleUploadNfPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !invoice) return
    setUploadingPdf(true)
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/nota-fiscal`, {
      method: "POST",
      body: formData,
    })
    if (res.ok) {
      toast.success("PDF da NF enviado")
      await fetchInvoice()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao enviar PDF")
    }
    setUploadingPdf(false)
    if (nfFileRef.current) nfFileRef.current.value = ""
  }

  async function handleDeleteNfPdf() {
    if (!invoice) return
    setDeletingPdf(true)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/nota-fiscal`, {
      method: "DELETE",
    })
    if (res.ok) {
      toast.success("PDF removido")
      await fetchInvoice()
    } else {
      toast.error("Erro ao remover PDF")
    }
    setDeletingPdf(false)
  }

  async function handleSaveNotes() {
    if (!invoice) return
    setSavingNotes(true)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    })
    if (res.ok) toast.success("Notas salvas")
    setSavingNotes(false)
  }

  async function handleAddItem() {
    if (!invoice) return
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
      setNewItemPrice("")
      await fetchInvoice()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao adicionar item")
    }
    setAddingItem(false)
  }

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
    if (!invoice || !editingItemId) return
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
      await fetchInvoice()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao atualizar item")
    }
    setSavingEdit(false)
  }

  async function handleDeleteItem(itemId: string) {
    if (!invoice) return
    if (!confirm("Remover este item da fatura?")) return

    setDeletingItemId(itemId)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/items/${itemId}`, {
      method: "DELETE",
    })

    if (res.ok) {
      toast.success("Item removido")
      await fetchInvoice()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao remover item")
    }
    setDeletingItemId(null)
  }

  if (loading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  if (!invoice) return <div className="text-destructive">Fatura não encontrada</div>

  const isEditable = invoice.status === "PENDENTE" || invoice.status === "ENVIADO"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{invoice.patient.name}</h2>
          <p className="text-muted-foreground">
            {MONTH_NAMES[invoice.referenceMonth - 1]}/{invoice.referenceYear} — {invoice.professionalProfile.user.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={invoice.status}
            onChange={e => handleStatusChange(e.target.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border-0 cursor-pointer appearance-none pr-7 bg-no-repeat bg-[length:12px] bg-[right_8px_center] ${STATUS_COLORS[invoice.status] || ""}`}
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">
            Venc.: {new Date(invoice.dueDate).toLocaleDateString("pt-BR")}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <a href={`/api/financeiro/faturas/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">
          Baixar PDF
        </a>
        <button onClick={handleEnviarWhatsApp} className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors">
          Enviar WhatsApp
        </button>
        <button onClick={handleDelete} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors">
          Excluir Fatura
        </button>
      </div>

      {/* Nota Fiscal */}
      <div className="p-4 rounded-lg border border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Nota Fiscal</h3>
          <button
            onClick={handleToggleNf}
            disabled={togglingNf}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
              invoice.notaFiscalEmitida
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {togglingNf ? "..." : invoice.notaFiscalEmitida ? "NF Emitida" : "Marcar NF Emitida"}
          </button>
        </div>
        {invoice.notaFiscalEmitidaAt && (
          <p className="text-xs text-muted-foreground">
            Emitida em {new Date(invoice.notaFiscalEmitidaAt).toLocaleDateString("pt-BR")}
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={nfFileRef}
            type="file"
            accept="application/pdf"
            onChange={handleUploadNfPdf}
            className="hidden"
          />
          <button
            onClick={() => nfFileRef.current?.click()}
            disabled={uploadingPdf}
            className="px-3 py-1.5 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            {uploadingPdf ? "Enviando..." : "Upload PDF"}
          </button>
          {invoice.hasNotaFiscalPdf && (
            <>
              <a
                href={`/api/financeiro/faturas/${invoice.id}/nota-fiscal`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Baixar PDF
              </a>
              <button
                onClick={handleDeleteNfPdf}
                disabled={deletingPdf}
                className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-xs font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deletingPdf ? "..." : "Remover PDF"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-bold">{formatCurrencyBRL(Number(invoice.totalAmount))}</div>
        </div>
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Sessões</div>
          <div className="text-lg font-bold">{invoice.totalSessions}</div>
        </div>
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Créditos</div>
          <div className="text-lg font-bold">{invoice.creditsApplied}</div>
        </div>
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Extras</div>
          <div className="text-lg font-bold">{invoice.extrasAdded}</div>
        </div>
      </div>

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
            {[...invoice.items].sort((a, b) => {
              const dateA = a.appointment?.scheduledAt ?? ""
              const dateB = b.appointment?.scheduledAt ?? ""
              return dateA.localeCompare(dateB)
            }).map(item => {
              const isCredit = item.type === "CREDITO"
              const isEditing = editingItemId === item.id

              if (isEditing) {
                return (
                  <tr key={item.id} className="border-b border-border last:border-0 bg-yellow-50 dark:bg-yellow-900/20">
                    <td className="py-2 px-4">
                      <input
                        type="text"
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
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
                        value={editQuantity}
                        onChange={e => setEditQuantity(parseInt(e.target.value) || 1)}
                        className="w-16 px-2 py-1 rounded border border-border bg-background text-sm text-center"
                      />
                    </td>
                    <td className="text-right py-2 px-4">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editPrice}
                        onChange={e => setEditPrice(e.target.value)}
                        className="w-24 px-2 py-1 rounded border border-border bg-background text-sm text-right"
                      />
                    </td>
                    <td className="text-right py-2 px-4 text-muted-foreground text-xs">
                      {formatCurrencyBRL((parseFloat(editPrice) || 0) * editQuantity * (isCredit ? -1 : 1))}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        <button
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingEdit ? "..." : "OK"}
                        </button>
                        <button
                          onClick={cancelEdit}
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
                <tr key={item.id} className={`border-b border-border last:border-0 ${isCredit ? "text-red-600 dark:text-red-400" : ""}`}>
                  <td className="py-3 px-4">{item.description}</td>
                  <td className="text-center py-3 px-4 text-muted-foreground">
                    {item.appointment ? new Date(item.appointment.scheduledAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="text-center py-3 px-4">{item.quantity}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(item.unitPrice))}</td>
                  <td className="text-right py-3 px-4 font-medium">{formatCurrencyBRL(Number(item.total))}</td>
                  {isEditable && (
                    <td className="py-3 px-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(item)}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                          title="Editar item"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={deletingItemId === item.id}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          title="Remover item"
                        >
                          {deletingItemId === item.id ? "..." : "✕"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
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
              onClick={() => setShowAddForm(true)}
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

      {/* Message body */}
      {invoice.messageBody && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Mensagem da Fatura</h3>
          <div className="p-4 rounded-lg border border-border bg-muted/30 whitespace-pre-wrap text-sm">
            {invoice.messageBody}
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Observações</h3>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
          placeholder="Notas internas sobre esta fatura..."
        />
        <button
          onClick={handleSaveNotes}
          disabled={savingNotes}
          className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {savingNotes ? "Salvando..." : "Salvar Notas"}
        </button>
      </div>
    </div>
  )
}
