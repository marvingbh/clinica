"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { toast } from "sonner"

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
  patient: { id: string; name: string; phone: string; motherName: string | null }
  professionalProfile: { id: string; user: { name: string } }
  items: Array<{
    id: string
    type: string
    description: string
    quantity: number
    unitPrice: string
    total: string
    appointment: { id: string; scheduledAt: string; status: string } | null
  }>
  consumedCredits: Array<{ id: string; reason: string; createdAt: string }>
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
}

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  PAGO: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CANCELADO: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    fetch(`/api/financeiro/faturas/${params.id}`)
      .then(r => r.json())
      .then(data => {
        setInvoice(data)
        setNotes(data.notes || "")
      })
      .finally(() => setLoading(false))
  }, [params.id])

  async function handleAction(action: string) {
    if (!invoice) return

    if (action === "pagar") {
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAGO" }),
      })
      if (res.ok) {
        toast.success("Fatura marcada como paga")
        setInvoice({ ...invoice, status: "PAGO", paidAt: new Date().toISOString() })
      }
    } else if (action === "cancelar") {
      if (!confirm("Cancelar esta fatura? Os créditos consumidos serão liberados.")) return
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Fatura cancelada")
        router.push("/financeiro/faturas")
      }
    } else if (action === "enviar") {
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}/enviar`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        toast.success("Fatura enviada via WhatsApp")
      } else {
        toast.error(data.error || "Erro ao enviar")
      }
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

  if (loading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  if (!invoice) return <div className="text-destructive">Fatura não encontrada</div>

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
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[invoice.status] || ""}`}>
            {STATUS_LABELS[invoice.status] || invoice.status}
          </span>
          <span className="text-sm text-muted-foreground">
            Venc.: {new Date(invoice.dueDate).toLocaleDateString("pt-BR")}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {invoice.status === "PENDENTE" && (
          <button onClick={() => handleAction("pagar")} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
            Marcar como Pago
          </button>
        )}
        <a href={`/api/financeiro/faturas/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">
          Baixar PDF
        </a>
        <button onClick={() => handleAction("enviar")} className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors">
          Enviar WhatsApp
        </button>
        {invoice.status !== "CANCELADO" && (
          <button onClick={() => handleAction("cancelar")} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors">
            Cancelar Fatura
          </button>
        )}
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
              <th className="text-center py-3 px-4 font-medium">Qtd</th>
              <th className="text-right py-3 px-4 font-medium">Valor Unit.</th>
              <th className="text-right py-3 px-4 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map(item => {
              const isCredit = item.type === "CREDITO"
              return (
                <tr key={item.id} className={`border-b border-border last:border-0 ${isCredit ? "text-red-600 dark:text-red-400" : ""}`}>
                  <td className="py-3 px-4">{item.description}</td>
                  <td className="text-center py-3 px-4">{item.quantity}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(item.unitPrice))}</td>
                  <td className="text-right py-3 px-4 font-medium">{formatCurrencyBRL(Number(item.total))}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <td colSpan={3} className="py-3 px-4 text-right">Total</td>
              <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(invoice.totalAmount))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

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
