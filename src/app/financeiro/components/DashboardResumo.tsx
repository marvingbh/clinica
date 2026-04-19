"use client"

import { formatCurrencyBRL } from "@/lib/financeiro/format"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts"
import {
  DashboardData, SummaryCard, CustomTooltip,
  CHART_COLORS, SHORT_MONTHS, MONTH_NAMES,
} from "./dashboard-shared"

interface Props {
  data: DashboardData
  month: number | null
  onMonthClick: (m: number) => void
}

const A_RECEBER_COLOR = "#f59e0b" // amber-500

export function DashboardResumo({ data, month, onMonthClick }: Props) {
  const totalAReceber = data.totalPendente + data.totalEnviado + data.totalParcial
  const aReceberCount = data.pendingCount + data.enviadoCount + data.parcialCount
  const paidPercent = data.totalFaturado > 0
    ? Math.round((data.totalPago / data.totalFaturado) * 100) : 0

  const monthlyChartData = Array.from({ length: 12 }, (_, i) => {
    const md = data.byMonth[i + 1]
    return {
      name: SHORT_MONTHS[i],
      Recebido: md?.pago || 0,
      "A receber": (md?.pendente || 0) + (md?.enviado || 0) + (md?.parcial || 0),
    }
  })

  const monthlySessionsData = Array.from({ length: 12 }, (_, i) => {
    const md = data.byMonth[i + 1]
    return { name: SHORT_MONTHS[i], Sessões: md?.sessions || 0, Créditos: md?.credits || 0, Extras: md?.extras || 0 }
  })

  const statusPieData = [
    { name: "Recebido", value: data.paidCount },
    { name: "A receber", value: aReceberCount },
  ].filter(d => d.value > 0)
  const statusPieColors = [CHART_COLORS.pago, A_RECEBER_COLOR]

  const profChartData = data.byProfessional.map(p => ({
    name: p.name.split(" ")[0],
    Recebido: p.pago,
    "A receber": p.pendente + p.enviado + p.parcial,
  }))

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Faturado" value={formatCurrencyBRL(data.totalFaturado)} sub={`${data.invoiceCount} faturas`} />
        <SummaryCard label="A Receber" value={formatCurrencyBRL(totalAReceber)} sub={`${aReceberCount} faturas`} variant="warning" />
        <SummaryCard label="Recebido" value={formatCurrencyBRL(data.totalPago)} sub={`${paidPercent}% do total`} variant="success" />
        <SummaryCard label="Créditos Disponíveis" value={String(data.availableCredits)} sub="não consumidos" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: data.totalSessions, label: "Sessões" },
          { value: data.totalCredits, label: "Créditos Aplicados" },
          { value: data.totalExtras, label: "Sessões Extras" },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-lg border border-border text-center">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Year view charts */}
      {!month && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-4 rounded-lg border border-border">
              <h3 className="text-sm font-semibold mb-4">Faturamento Mensal</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyChartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Recebido" stackId="billing" fill={CHART_COLORS.pago} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="A receber" stackId="billing" fill={A_RECEBER_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {statusPieData.length > 0 && (
              <div className="p-4 rounded-lg border border-border">
                <h3 className="text-sm font-semibold mb-4">Status das Faturas</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={statusPieData} cx="50%" cy="45%" innerRadius={50} outerRadius={85}
                      paddingAngle={3} dataKey="value"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {statusPieData.map((_, i) => <Cell key={i} fill={statusPieColors[i]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [String(value), "Faturas"]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

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
        </>
      )}

      {/* Professional bar chart */}
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
              <Bar dataKey="Recebido" stackId="billing" fill={CHART_COLORS.pago} radius={[0, 0, 0, 0]} />
              <Bar dataKey="A receber" stackId="billing" fill={A_RECEBER_COLOR} radius={[0, 3, 3, 0]} />
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
            <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${paidPercent}%` }} />
          </div>
        </div>
      )}

      {/* Month view pie charts */}
      {month && data.totalFaturado > 0 && (
        <div className={`grid grid-cols-1 ${data.byProfessional.length > 1 ? "lg:grid-cols-2" : ""} gap-6`}>
          <div className="p-4 rounded-lg border border-border">
            <h3 className="text-sm font-semibold mb-4">Recebido vs Total</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Recebido", value: data.totalPago },
                    { name: "A receber", value: Math.max(0, data.totalFaturado - data.totalPago) },
                  ].filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  <Cell fill={CHART_COLORS.pago} /><Cell fill={A_RECEBER_COLOR} />
                </Pie>
                <Tooltip formatter={(value) => [formatCurrencyBRL(Number(value)), ""]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {data.byProfessional.length > 1 && (
            <div className="p-4 rounded-lg border border-border">
              <h3 className="text-sm font-semibold mb-4">Recebido por Profissional</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.byProfessional.filter(p => p.pago > 0).map(p => ({ name: p.name.split(" ")[0], value: p.pago }))}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {data.byProfessional.filter(p => p.pago > 0).map((_, i) => (
                      <Cell key={i} fill={["#22c55e", "#3b82f6", "#f97316", "#eab308", "#ef4444"][i % 5]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [formatCurrencyBRL(Number(value)), ""]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Professional table */}
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
                  <th className="text-right py-3 px-4 font-medium">A Receber</th>
                  <th className="text-right py-3 px-4 font-medium">Recebido</th>
                  <th className="text-right py-3 px-4 font-medium">% Recebido</th>
                </tr>
              </thead>
              <tbody>
                {data.byProfessional.map(prof => {
                  const pp = prof.faturado > 0 ? Math.round((prof.pago / prof.faturado) * 100) : 0
                  const aReceber = prof.pendente + prof.enviado + prof.parcial
                  return (
                    <tr key={prof.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">{prof.name}</td>
                      <td className="text-center py-3 px-4">{prof.patientCount}</td>
                      <td className="text-center py-3 px-4">{prof.sessions}</td>
                      <td className="text-right py-3 px-4">{formatCurrencyBRL(prof.faturado)}</td>
                      <td className="text-right py-3 px-4 text-amber-600">{formatCurrencyBRL(aReceber)}</td>
                      <td className="text-right py-3 px-4 text-green-600">{formatCurrencyBRL(prof.pago)}</td>
                      <td className="text-right py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${pp}%` }} />
                          </div>
                          <span className="text-xs font-medium w-8 text-right">{pp}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Month table (year view) */}
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
                  <th className="text-right py-3 px-4 font-medium">A Receber</th>
                  <th className="text-right py-3 px-4 font-medium">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const md = data.byMonth[m]
                  if (!md) return null
                  const aReceber = md.pendente + md.enviado + md.parcial
                  return (
                    <tr key={m} className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => onMonthClick(m)}>
                      <td className="py-3 px-4 font-medium text-primary">{MONTH_NAMES[m - 1]}</td>
                      <td className="text-center py-3 px-4">
                        {md.invoiceCount}
                        {md.pendingCount > 0 && <span className="text-amber-600 text-xs ml-1">({md.pendingCount} pend.)</span>}
                      </td>
                      <td className="text-center py-3 px-4">{md.sessions}</td>
                      <td className="text-right py-3 px-4">{formatCurrencyBRL(md.faturado)}</td>
                      <td className="text-right py-3 px-4 text-amber-600">{aReceber > 0 ? formatCurrencyBRL(aReceber) : "—"}</td>
                      <td className="text-right py-3 px-4 text-green-600">{md.pago > 0 ? formatCurrencyBRL(md.pago) : "—"}</td>
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
                  <td className="text-right py-3 px-4 text-amber-600">{formatCurrencyBRL(totalAReceber)}</td>
                  <td className="text-right py-3 px-4 text-green-600">{formatCurrencyBRL(data.totalPago)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
