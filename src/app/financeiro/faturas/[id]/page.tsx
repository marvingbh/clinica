"use client"

import React, { useState, useCallback } from "react"
import { useMountEffect } from "@/shared/hooks"
import { useParams, useRouter } from "next/navigation"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { toast } from "sonner"
import { STATUS_LABELS, STATUS_COLORS } from "../invoice-status"
import type { InvoiceDetail } from "./types"
import HistoryTab from "./HistoryTab"
import InvoiceItemsTable from "./InvoiceItemsTable"
import NfSection from "./NfSection"

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [dueDateValue, setDueDateValue] = useState("")
  const [activeTab, setActiveTab] = useState<"details" | "history">("details")

  const fetchInvoice = useCallback(async () => {
    const res = await fetch(`/api/financeiro/faturas/${params.id}`)
    if (res.ok) {
      const data = await res.json()
      setInvoice(data)
      setNotes(data.notes || "")
    }
  }, [params.id])

  useMountEffect(() => {
    fetchInvoice().finally(() => setLoading(false))
  })

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

  async function handleRecalcular() {
    if (!invoice) return
    if (!confirm("Recalcular esta fatura? Os itens automáticos serão regenerados.")) return
    setRecalculating(true)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}/recalcular`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao recalcular fatura")
        return
      }
      toast.success(data.message || "Fatura recalculada com sucesso")
      fetchInvoice()
    } catch {
      toast.error("Erro ao recalcular fatura")
    } finally {
      setRecalculating(false)
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

  function startEditingDueDate() {
    if (!invoice) return
    setDueDateValue(new Date(invoice.dueDate).toISOString().slice(0, 10))
    setEditingDueDate(true)
  }

  async function saveDueDate() {
    if (!invoice || !dueDateValue) { setEditingDueDate(false); return }
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: `${dueDateValue}T12:00:00.000Z` }),
    })
    if (res.ok) {
      setInvoice({ ...invoice, dueDate: `${dueDateValue}T12:00:00.000Z` })
      toast.success("Vencimento atualizado")
    } else {
      toast.error("Erro ao atualizar vencimento")
    }
    setEditingDueDate(false)
  }

  if (loading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  if (!invoice) return <div className="text-destructive">Fatura não encontrada</div>

  const isEditable = invoice.status === "PENDENTE" || invoice.status === "ENVIADO" || invoice.status === "PARCIAL"

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
          {editingDueDate ? (
            <input
              type="date"
              value={dueDateValue}
              onChange={e => setDueDateValue(e.target.value)}
              onBlur={saveDueDate}
              onKeyDown={e => {
                if (e.key === "Enter") saveDueDate()
                if (e.key === "Escape") setEditingDueDate(false)
              }}
              autoFocus
              className="px-2 py-1 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <span
              onClick={startEditingDueDate}
              className="text-sm text-muted-foreground cursor-pointer hover:text-primary transition-colors"
              title="Clique para alterar vencimento"
            >
              Venc.: {formatDateBR(invoice.dueDate)}
            </span>
          )}
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
        {isEditable && (
          <button
            onClick={handleRecalcular}
            disabled={recalculating}
            className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 disabled:opacity-50 transition-colors"
          >
            {recalculating ? "Recalculando..." : "Recalcular"}
          </button>
        )}
        <button onClick={handleDelete} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors">
          Excluir Fatura
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "details"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Detalhes
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Histórico
        </button>
      </div>

      {activeTab === "history" ? (
        <HistoryTab invoiceId={invoice.id} />
      ) : (
      <>
        <NfSection invoice={invoice} onRefresh={fetchInvoice} />

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

        {/* Payments */}
        {invoice.reconciliationLinks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Pagamentos</h3>
            <div className="rounded-lg border border-border divide-y divide-border">
              {invoice.reconciliationLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs">&#x2713;</span>
                    <div>
                      <p className="font-medium">{link.transaction.payerName || "Pagamento"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(link.transaction.date).toLocaleDateString("pt-BR")}
                        {link.transaction.description && ` — ${link.transaction.description}`}
                      </p>
                    </div>
                  </div>
                  <span className="font-medium text-green-600">
                    {formatCurrencyBRL(Number(link.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <InvoiceItemsTable invoice={invoice} isEditable={isEditable} onRefresh={fetchInvoice} />

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
      </>
      )}
    </div>
  )
}
