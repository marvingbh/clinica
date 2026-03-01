"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { EyeIcon } from "@/shared/components/ui/icons"
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

  const fetchRepasse = useCallback(() => {
    if (month === null) return
    setLoading(true)
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    fetch(`/api/financeiro/repasse?${params}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year, month])

  useEffect(() => { fetchRepasse() }, [fetchRepasse])

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
              <th className="text-right py-3 px-4 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.professionals.map(p => (
              <tr key={p.professionalId} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="py-3 px-4 font-medium">{p.name}</td>
                <td className="text-center py-3 px-4">{p.repassePercent}%</td>
                <td className="text-center py-3 px-4">{p.totalSessions}</td>
                <td className="text-right py-3 px-4">{formatCurrencyBRL(p.totalGross)}</td>
                <td className="text-right py-3 px-4">{formatCurrencyBRL(p.totalTax)}</td>
                <td className="text-right py-3 px-4">{formatCurrencyBRL(p.totalAfterTax)}</td>
                <td className="text-right py-3 px-4 font-bold">{formatCurrencyBRL(p.totalRepasse)}</td>
                <td className="text-right py-3 px-4">
                  <Link
                    href={`/financeiro/repasse/${p.professionalId}?year=${year}&month=${month}`}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors inline-flex"
                    title="Ver detalhes"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
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
              <td className="py-3 px-4"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
