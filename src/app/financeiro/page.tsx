"use client"

import React, { useEffect, useState, useCallback } from "react"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts"

interface ProfessionalSummary {
  id: string
  name: string
  faturado: number
  pendente: number
  pago: number
  sessions: number
  invoiceCount: number
  patientCount: number
}

interface MonthSummary {
  faturado: number; pendente: number; pago: number
  sessions: number; credits: number; extras: number
  invoiceCount: number; pendingCount: number; paidCount: number
}

interface DashboardData {
  year: number
  month: number | null
  totalFaturado: number
  totalPendente: number
  totalPago: number
  totalSessions: number
  totalCredits: number
  totalExtras: number
  invoiceCount: number
  pendingCount: number
  paidCount: number
  availableCredits: number
  byMonth: Record<number, MonthSummary>
  byProfessional: ProfessionalSummary[]
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const SHORT_MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

const CHART_COLORS = {
  faturado: "#6366f1",
  pago: "#22c55e",
  pendente: "#eab308",
  sessions: "#3b82f6",
  credits: "#ef4444",
  extras: "#f97316",
}

const PIE_COLORS = ["#22c55e", "#eab308", "#ef4444"]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }, i: number) => (
        <p key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{formatCurrencyBRL(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

export default function FinanceiroDashboard() {
  const now = new Date()
  const [data, setData] = useState<DashboardData | null>(null)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ year: String(year) })
    if (month) params.set("month", String(month))
    fetch(`/api/financeiro/dashboard?${params}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  if (!data) return <div className="text-destructive">Erro ao carregar dados</div>

  const paidPercent = data.totalFaturado > 0
    ? Math.round((data.totalPago / data.totalFaturado) * 100)
    : 0

  // Prepare chart data
  const monthlyChartData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const md = data.byMonth[m]
    return {
      name: SHORT_MONTHS[i],
      Faturado: md?.faturado || 0,
      Recebido: md?.pago || 0,
      Pendente: md?.pendente || 0,
    }
  })

  const monthlySessionsData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const md = data.byMonth[m]
    return {
      name: SHORT_MONTHS[i],
      Sessões: md?.sessions || 0,
      Créditos: md?.credits || 0,
      Extras: md?.extras || 0,
    }
  })

  const statusPieData = [
    { name: "Pago", value: data.paidCount },
    { name: "Pendente", value: data.pendingCount },
    { name: "Cancelado", value: data.invoiceCount - data.paidCount - data.pendingCount },
  ].filter(d => d.value > 0)

  const profChartData = data.byProfessional.map(p => ({
    name: p.name.split(" ")[0],
    Faturado: p.faturado,
    Recebido: p.pago,
    Pendente: p.pendente,
  }))

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setYear(y => y - 1)} className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">&larr;</button>
        <span className="text-lg font-semibold">{year}</span>
        <button onClick={() => setYear(y => y + 1)} className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">&rarr;</button>

        <div className="flex gap-1 ml-2">
          <button
            onClick={() => setMonth(null)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              month === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Ano todo
          </button>
          {SHORT_MONTHS.map((name, i) => (
            <button
              key={i}
              onClick={() => setMonth(i + 1)}
              className={`px-2.5 py-1.5 text-xs rounded-full transition-colors ${
                month === i + 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <h2 className="text-lg font-semibold">
        {month ? `${MONTH_NAMES[month - 1]} ${year}` : `Consolidado ${year}`}
      </h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Faturado" value={formatCurrencyBRL(data.totalFaturado)} sub={`${data.invoiceCount} faturas`} />
        <SummaryCard label="Pendente" value={formatCurrencyBRL(data.totalPendente)} sub={`${data.pendingCount} faturas`} variant="warning" />
        <SummaryCard label="Recebido" value={formatCurrencyBRL(data.totalPago)} sub={`${paidPercent}% do total`} variant="success" />
        <SummaryCard label="Créditos Disponíveis" value={String(data.availableCredits)} sub="não consumidos" variant="info" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 rounded-lg border border-border text-center">
          <div className="text-2xl font-bold">{data.totalSessions}</div>
          <div className="text-xs text-muted-foreground">Sessões</div>
        </div>
        <div className="p-3 rounded-lg border border-border text-center">
          <div className="text-2xl font-bold">{data.totalCredits}</div>
          <div className="text-xs text-muted-foreground">Créditos Aplicados</div>
        </div>
        <div className="p-3 rounded-lg border border-border text-center">
          <div className="text-2xl font-bold">{data.totalExtras}</div>
          <div className="text-xs text-muted-foreground">Sessões Extras</div>
        </div>
      </div>

      {/* Charts row — Revenue bar chart + Status pie chart */}
      {!month && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly revenue bar chart */}
          <div className="lg:col-span-2 p-4 rounded-lg border border-border">
            <h3 className="text-sm font-semibold mb-4">Faturamento Mensal</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Recebido" fill={CHART_COLORS.pago} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Pendente" fill={CHART_COLORS.pendente} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Payment status pie chart */}
          {statusPieData.length > 0 && (
            <div className="p-4 rounded-lg border border-border">
              <h3 className="text-sm font-semibold mb-4">Status das Faturas</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [String(value), "Faturas"]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Sessions trend line chart (year view) */}
      {!month && (
        <div className="p-4 rounded-lg border border-border">
          <h3 className="text-sm font-semibold mb-4">Sessões por Mês</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlySessionsData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Sessões" stroke={CHART_COLORS.sessions} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Créditos" stroke={CHART_COLORS.credits} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Extras" stroke={CHART_COLORS.extras} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Professional comparison bar chart */}
      {data.byProfessional.length > 1 && (
        <div className="p-4 rounded-lg border border-border">
          <h3 className="text-sm font-semibold mb-4">Faturamento por Profissional</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, data.byProfessional.length * 60)}>
            <BarChart data={profChartData} layout="vertical" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} className="fill-muted-foreground" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Recebido" fill={CHART_COLORS.pago} radius={[0, 3, 3, 0]} />
              <Bar dataKey="Pendente" fill={CHART_COLORS.pendente} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment progress bar */}
      {data.totalFaturado > 0 && (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Recebido vs Faturado</span>
            <span>{formatCurrencyBRL(data.totalPago)} / {formatCurrencyBRL(data.totalFaturado)} ({paidPercent}%)</span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${paidPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* By Professional table */}
      {data.byProfessional.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Detalhes por Profissional</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium">Profissional</th>
                  <th className="text-center py-3 px-4 font-medium">Pacientes</th>
                  <th className="text-center py-3 px-4 font-medium">Sessões</th>
                  <th className="text-right py-3 px-4 font-medium">Faturado</th>
                  <th className="text-right py-3 px-4 font-medium">Pendente</th>
                  <th className="text-right py-3 px-4 font-medium">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {data.byProfessional.map(prof => (
                  <tr key={prof.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4 font-medium">{prof.name}</td>
                    <td className="text-center py-3 px-4">{prof.patientCount}</td>
                    <td className="text-center py-3 px-4">{prof.sessions}</td>
                    <td className="text-right py-3 px-4">{formatCurrencyBRL(prof.faturado)}</td>
                    <td className="text-right py-3 px-4 text-yellow-600 dark:text-yellow-400">
                      {formatCurrencyBRL(prof.pendente)}
                    </td>
                    <td className="text-right py-3 px-4 text-green-600 dark:text-green-400">
                      {formatCurrencyBRL(prof.pago)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Month table (only when viewing full year) */}
      {!month && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Detalhes por Mês</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium">Mês</th>
                  <th className="text-center py-3 px-4 font-medium">Faturas</th>
                  <th className="text-center py-3 px-4 font-medium">Sessões</th>
                  <th className="text-right py-3 px-4 font-medium">Faturado</th>
                  <th className="text-right py-3 px-4 font-medium">Pendente</th>
                  <th className="text-right py-3 px-4 font-medium">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const md = data.byMonth[m]
                  if (!md) return null
                  return (
                    <tr
                      key={m}
                      className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setMonth(m)}
                    >
                      <td className="py-3 px-4 font-medium text-primary">{MONTH_NAMES[m - 1]}</td>
                      <td className="text-center py-3 px-4">
                        {md.invoiceCount}
                        {md.pendingCount > 0 && (
                          <span className="text-yellow-600 dark:text-yellow-400 text-xs ml-1">
                            ({md.pendingCount} pend.)
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-4">{md.sessions}</td>
                      <td className="text-right py-3 px-4">{formatCurrencyBRL(md.faturado)}</td>
                      <td className="text-right py-3 px-4 text-yellow-600 dark:text-yellow-400">
                        {md.pendente > 0 ? formatCurrencyBRL(md.pendente) : "—"}
                      </td>
                      <td className="text-right py-3 px-4 text-green-600 dark:text-green-400">
                        {md.pago > 0 ? formatCurrencyBRL(md.pago) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold">
                  <td className="py-3 px-4">Total</td>
                  <td className="text-center py-3 px-4">{data.invoiceCount}</td>
                  <td className="text-center py-3 px-4">{data.totalSessions}</td>
                  <td className="text-right py-3 px-4">{formatCurrencyBRL(data.totalFaturado)}</td>
                  <td className="text-right py-3 px-4 text-yellow-600 dark:text-yellow-400">
                    {formatCurrencyBRL(data.totalPendente)}
                  </td>
                  <td className="text-right py-3 px-4 text-green-600 dark:text-green-400">
                    {formatCurrencyBRL(data.totalPago)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, variant }: {
  label: string; value: string; sub?: string
  variant?: "warning" | "success" | "info"
}) {
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
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
