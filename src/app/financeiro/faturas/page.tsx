"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { toast } from "sonner"

interface Invoice {
  id: string
  referenceMonth: number
  referenceYear: number
  status: string
  totalSessions: number
  totalAmount: string
  dueDate: string
  paidAt: string | null
  patient: { id: string; name: string }
  professionalProfile: { id: string; user: { name: string } }
  _count: { items: number }
}

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

export default function FaturasPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [statusFilter, setStatusFilter] = useState("")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const fetchInvoices = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("month", String(month))
    params.set("year", String(year))
    if (statusFilter) params.set("status", statusFilter)
    fetch(`/api/financeiro/faturas?${params}`)
      .then(r => r.json())
      .then(setInvoices)
      .finally(() => setLoading(false))
  }, [month, year, statusFilter])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch("/api/financeiro/faturas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao gerar faturas")
        return
      }
      toast.success(`${data.generated} fatura(s) gerada(s)`)
      fetchInvoices()
    } finally {
      setGenerating(false)
    }
  }

  async function handleMarkPaid(id: string) {
    const res = await fetch(`/api/financeiro/faturas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAGO" }),
    })
    if (res.ok) {
      toast.success("Fatura marcada como paga")
      fetchInvoices()
    } else {
      toast.error("Erro ao atualizar fatura")
    }
  }

  const MONTH_NAMES = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ]

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm w-20"
          />
        </div>

        <div className="flex gap-1">
          {[
            { label: "Todos", value: "" },
            { label: "Pendente", value: "PENDENTE" },
            { label: "Pago", value: "PAGO" },
            { label: "Cancelado", value: "CANCELADO" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="ml-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {generating ? "Gerando..." : "Gerar Faturas do Mês"}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma fatura encontrada para este período
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-medium">Paciente</th>
                <th className="text-center py-3 px-4 font-medium">Sessões</th>
                <th className="text-right py-3 px-4 font-medium">Total</th>
                <th className="text-center py-3 px-4 font-medium">Status</th>
                <th className="text-center py-3 px-4 font-medium">Vencimento</th>
                <th className="text-right py-3 px-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="py-3 px-4 font-medium">{inv.patient.name}</td>
                  <td className="text-center py-3 px-4">{inv.totalSessions}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(inv.totalAmount))}</td>
                  <td className="text-center py-3 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] || ""}`}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </td>
                  <td className="text-center py-3 px-4">{new Date(inv.dueDate).toLocaleDateString("pt-BR")}</td>
                  <td className="text-right py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/financeiro/faturas/${inv.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Ver
                      </Link>
                      {inv.status === "PENDENTE" && (
                        <button
                          onClick={() => handleMarkPaid(inv.id)}
                          className="text-xs text-green-600 dark:text-green-400 hover:underline"
                        >
                          Pagar
                        </button>
                      )}
                      <a
                        href={`/api/financeiro/faturas/${inv.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        PDF
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
