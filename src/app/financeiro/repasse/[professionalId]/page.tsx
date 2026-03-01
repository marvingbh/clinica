"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { formatCurrencyBRL, getMonthName } from "@/lib/financeiro/format"
import type { RepasseDetailData } from "../types"

export default function RepasseDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const professionalId = params.professionalId as string
  const year = searchParams.get("year")
  const month = searchParams.get("month")

  const [data, setData] = useState<RepasseDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!year || !month) return
    const res = await fetch(
      `/api/financeiro/repasse/${professionalId}?year=${year}&month=${month}`
    )
    if (res.ok) {
      setData(await res.json())
    }
  }, [professionalId, year, month])

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  if (!year || !month) {
    return <div className="text-destructive">Parâmetros de ano/mês ausentes</div>
  }
  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  }
  if (!data) {
    return <div className="text-destructive">Repasse não encontrado</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/financeiro/repasse"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Voltar
        </Link>
        <h2 className="text-xl font-bold mt-1">
          Repasse &mdash; {data.professional.name}
        </h2>
        <p className="text-muted-foreground text-sm">
          {getMonthName(data.month)} {data.year} &bull; Imposto: {data.taxPercent}%
          &bull; Repasse: {data.repassePercent}%
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Bruto" value={data.summary.totalGross} />
        <SummaryCard label="Imposto" value={data.summary.totalTax} />
        <SummaryCard label="Líquido" value={data.summary.totalAfterTax} />
        <SummaryCard
          label="Repasse Total"
          value={data.summary.totalRepasse}
          highlight
        />
      </div>

      {/* Per-invoice line items */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left py-3 px-4 font-medium">Paciente</th>
              <th className="text-center py-3 px-4 font-medium">Sessões</th>
              <th className="text-right py-3 px-4 font-medium">Bruto</th>
              <th className="text-right py-3 px-4 font-medium">Imposto</th>
              <th className="text-right py-3 px-4 font-medium">Líquido</th>
              <th className="text-right py-3 px-4 font-medium">Repasse</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.invoiceId}
                className="border-b border-border last:border-0"
              >
                <td className="py-3 px-4">{item.patientName}</td>
                <td className="text-center py-3 px-4">{item.totalSessions}</td>
                <td className="text-right py-3 px-4">
                  {formatCurrencyBRL(item.grossValue)}
                </td>
                <td className="text-right py-3 px-4">
                  {formatCurrencyBRL(item.taxAmount)}
                </td>
                <td className="text-right py-3 px-4">
                  {formatCurrencyBRL(item.afterTax)}
                </td>
                <td className="text-right py-3 px-4 font-medium">
                  {formatCurrencyBRL(item.repasseValue)}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhuma fatura encontrada neste período
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, highlight }: {
  label: string; value: number; highlight?: boolean
}) {
  return (
    <div className={`rounded-lg border border-border p-4 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>
        {formatCurrencyBRL(value)}
      </div>
    </div>
  )
}
