"use client"

import React, { useState, useCallback } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import Link from "next/link"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { EyeIcon, CheckCircleIcon } from "@/shared/components/ui/icons"
import { toast } from "sonner"
import { useFinanceiroContext } from "../context/FinanceiroContext"

interface ProfessionalRepasse {
  professionalId: string
  name: string
  repassePercent: number
  taxPercent: number
  totalInvoices: number
  totalSessions: number
  totalGross: number
  totalTax: number
  totalAfterTax: number
  totalRepasse: number
  paidAmount: number | null
  paidAt: string | null
  adjustment: number
}

interface RepasseResponse {
  year: number
  month: number
  taxPercent: number
  professionals: ProfessionalRepasse[]
}

export default function RepassePage() {
  const { year, month } = useFinanceiroContext()
  const [data, setData] = useState<RepasseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [payingProfId, setPayingProfId] = useState<string | null>(null)

  const fetchData = useCallback(() => {
    if (month === null) return
    setLoading(true)
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    fetch(`/api/financeiro/repasse?${params}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year, month])

  // Re-fetches when year/month filter changes.
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleMarkAsPaid = async (professionalId: string) => {
    if (month === null) return
    setPayingProfId(professionalId)
    try {
      const res = await fetch(`/api/financeiro/repasse/${professionalId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      })
      if (res.ok) {
        toast.success("Pagamento registrado")
        fetchData()
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Erro ao registrar pagamento")
      }
    } finally {
      setPayingProfId(null)
    }
  }

  const handleUndoPayment = async (professionalId: string) => {
    if (month === null) return
    setPayingProfId(professionalId)
    try {
      const res = await fetch(
        `/api/financeiro/repasse/${professionalId}/pay?year=${year}&month=${month}`,
        { method: "DELETE" },
      )
      if (res.ok) {
        toast.success("Pagamento desfeito")
        fetchData()
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Erro ao desfazer pagamento")
      }
    } finally {
      setPayingProfId(null)
    }
  }

  if (month === null) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Selecione um mês para ver o relatório de repasse
      </div>
    )
  }

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  }

  if (!data || data.professionals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhum dado de repasse encontrado para este período
      </div>
    )
  }

  const totals = data.professionals.reduce(
    (acc, p) => ({
      sessions: acc.sessions + p.totalSessions,
      gross: acc.gross + p.totalGross,
      tax: acc.tax + p.totalTax,
      afterTax: acc.afterTax + p.totalAfterTax,
      repasse: acc.repasse + p.totalRepasse,
    }),
    { sessions: 0, gross: 0, tax: 0, afterTax: 0, repasse: 0 },
  )

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Imposto da clínica: {data.taxPercent}%
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left py-3 px-4 font-medium">Profissional</th>
              <th className="text-center py-3 px-4 font-medium">% Repasse</th>
              <th className="text-center py-3 px-4 font-medium">Sessões</th>
              <th className="text-right py-3 px-4 font-medium">Bruto</th>
              <th className="text-right py-3 px-4 font-medium">Imposto</th>
              <th className="text-right py-3 px-4 font-medium">Líquido</th>
              <th className="text-right py-3 px-4 font-medium">Repasse</th>
              <th className="text-center py-3 px-4 font-medium">Status</th>
              <th className="text-right py-3 px-4 font-medium">Pago</th>
              <th className="text-right py-3 px-4 font-medium">Saldo</th>
              <th className="text-right py-3 px-4 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.professionals.map(p => {
              const isPaid = p.paidAmount !== null
              const saldo = isPaid ? p.adjustment : p.totalRepasse
              return (
                <tr key={p.professionalId} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="py-3 px-4 font-medium">{p.name}</td>
                  <td className="text-center py-3 px-4">{p.repassePercent}%</td>
                  <td className="text-center py-3 px-4">{p.totalSessions}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(p.totalGross)}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(p.totalTax)}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(p.totalAfterTax)}</td>
                  <td className="text-right py-3 px-4 font-bold">{formatCurrencyBRL(p.totalRepasse)}</td>
                  <td className="text-center py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isPaid
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                    }`}>
                      {isPaid ? "Pago" : "Pendente"}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">
                    {isPaid ? formatCurrencyBRL(p.paidAmount!) : "—"}
                  </td>
                  <td className={`text-right py-3 px-4 font-medium ${
                    saldo < 0 ? "text-red-600 dark:text-red-400" : saldo > 0 ? "text-amber-600 dark:text-amber-400" : ""
                  }`}>
                    {saldo !== 0 ? formatCurrencyBRL(saldo) : "—"}
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/financeiro/repasse/${p.professionalId}?year=${year}&month=${month}`}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors inline-flex"
                        title="Ver detalhes"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </Link>
                      {isPaid ? (
                        <button
                          onClick={() => handleUndoPayment(p.professionalId)}
                          disabled={payingProfId === p.professionalId}
                          className="p-1.5 rounded-md text-green-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors inline-flex"
                          title="Desfazer pagamento"
                        >
                          {payingProfId === p.professionalId ? "..." : <CheckCircleIcon className="w-4 h-4" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMarkAsPaid(p.professionalId)}
                          disabled={payingProfId === p.professionalId || p.totalRepasse === 0}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors inline-flex disabled:opacity-50"
                          title="Marcar como pago"
                        >
                          {payingProfId === p.professionalId ? "..." : <CheckCircleIcon className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/50 font-medium">
              <td className="py-3 px-4">{data.professionals.length} profissional(is)</td>
              <td className="text-center py-3 px-4"></td>
              <td className="text-center py-3 px-4">{totals.sessions}</td>
              <td className="text-right py-3 px-4">{formatCurrencyBRL(totals.gross)}</td>
              <td className="text-right py-3 px-4">{formatCurrencyBRL(totals.tax)}</td>
              <td className="text-right py-3 px-4">{formatCurrencyBRL(totals.afterTax)}</td>
              <td className="text-right py-3 px-4 font-bold">{formatCurrencyBRL(totals.repasse)}</td>
              <td colSpan={4} className="py-3 px-4"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
