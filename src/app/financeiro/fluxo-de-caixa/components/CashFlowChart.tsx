"use client"

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

interface Entry {
  date: string
  inflow: number
  outflow: number
  net: number
  runningBalance: number
}

interface CashFlowChartProps {
  entries: Entry[]
  granularity: string
  todayDivider?: string | null
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

function formatDateLabel(dateStr: string, granularity: string) {
  const [y, m, d] = dateStr.split("-")
  if (granularity === "monthly") return `${m}/${y}`
  return `${d}/${m}`
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const [y, m, d] = (label ?? "").split("-")
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{d}/{m}/{y}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "inflow" ? "Entradas" : p.name === "outflow" ? "Saídas" : "Saldo"}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export function CashFlowChart({ entries, granularity, todayDivider }: CashFlowChartProps) {
  if (entries.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">Sem dados para o período</div>
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={entries} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDateLabel(v, granularity)}
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => formatCurrency(v)}
          tick={{ fontSize: 11 }}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="3 3" />
        {todayDivider && (
          <ReferenceLine x={todayDivider} stroke="#6366F1" strokeDasharray="5 5" label={{ value: "Hoje", position: "top", fontSize: 11, fill: "#6366F1" }} />
        )}
        <Area
          type="monotone"
          dataKey="inflow"
          fill="#22C55E"
          fillOpacity={0.15}
          stroke="#22C55E"
          strokeWidth={1.5}
          name="inflow"
        />
        <Area
          type="monotone"
          dataKey="outflow"
          fill="#EF4444"
          fillOpacity={0.15}
          stroke="#EF4444"
          strokeWidth={1.5}
          name="outflow"
        />
        <Line
          type="monotone"
          dataKey="runningBalance"
          stroke="#6366F1"
          strokeWidth={2}
          dot={false}
          name="runningBalance"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
