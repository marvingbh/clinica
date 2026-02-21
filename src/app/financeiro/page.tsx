"use client"

import React, { useEffect, useState } from "react"
import { formatCurrencyBRL } from "@/lib/financeiro/format"

interface DashboardData {
  year: number
  totalFaturado: number
  totalPendente: number
  totalPago: number
  availableCredits: number
  byMonth: Record<number, { faturado: number; pendente: number; pago: number }>
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function FinanceiroDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/financeiro/dashboard?year=${year}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year])

  if (loading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  if (!data) return <div className="text-destructive">Erro ao carregar dados</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setYear(y => y - 1)} className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">&larr;</button>
        <span className="text-lg font-semibold">{year}</span>
        <button onClick={() => setYear(y => y + 1)} className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">&rarr;</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Faturado" value={formatCurrencyBRL(data.totalFaturado)} />
        <SummaryCard label="Pendente" value={formatCurrencyBRL(data.totalPendente)} variant="warning" />
        <SummaryCard label="Recebido" value={formatCurrencyBRL(data.totalPago)} variant="success" />
        <SummaryCard label="Créditos Disponíveis" value={String(data.availableCredits)} variant="info" />
      </div>

      <h2 className="text-lg font-semibold mb-3">Por Mês</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left py-3 px-4 font-medium">Mês</th>
              <th className="text-right py-3 px-4 font-medium">Faturado</th>
              <th className="text-right py-3 px-4 font-medium">Pendente</th>
              <th className="text-right py-3 px-4 font-medium">Recebido</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const monthData = data.byMonth[m]
              if (!monthData) return null
              return (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="py-3 px-4">{MONTH_NAMES[m - 1]}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(monthData.faturado)}</td>
                  <td className="text-right py-3 px-4 text-yellow-600 dark:text-yellow-400">{formatCurrencyBRL(monthData.pendente)}</td>
                  <td className="text-right py-3 px-4 text-green-600 dark:text-green-400">{formatCurrencyBRL(monthData.pago)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, variant }: { label: string; value: string; variant?: "warning" | "success" | "info" }) {
  const variantClasses = {
    warning: "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20",
    success: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20",
    info: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20",
  }
  const cls = variant ? variantClasses[variant] : "border-border bg-card"

  return (
    <div className={`p-4 rounded-lg border ${cls}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  )
}
