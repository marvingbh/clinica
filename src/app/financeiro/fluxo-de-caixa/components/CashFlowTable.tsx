"use client"

import React from "react"

interface DetailItem {
  id: string
  description?: string
  professionalName?: string
  amount: number
  status?: string
}

interface EntryDetails {
  invoices: DetailItem[]
  expenses: DetailItem[]
  repasse: DetailItem[]
}

interface Entry {
  date: string
  inflow: number
  outflow: number
  net: number
  runningBalance: number
  details?: EntryDetails
}

interface CashFlowTableProps {
  entries: Entry[]
  granularity: string
  todayDivider?: string | null
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(dateStr: string, granularity: string) {
  const [y, m, d] = dateStr.split("-")
  if (granularity === "monthly") return `${m}/${y}`
  if (granularity === "weekly") return `Sem. ${d}/${m}/${y}`
  return `${d}/${m}/${y}`
}

function buildTooltipLines(items: DetailItem[], labelFn: (item: DetailItem) => string): string[] {
  return items.map((item) => `${labelFn(item)}: ${formatCurrency(item.amount)}`)
}

function InflowCell({ entry }: { entry: Entry }) {
  if (entry.inflow <= 0) return <span>—</span>

  const lines = entry.details
    ? buildTooltipLines(entry.details.invoices, (i) => i.description || "Fatura")
    : []

  return (
    <span className="relative group cursor-default">
      {formatCurrency(entry.inflow)}
      {lines.length > 0 && <Tooltip lines={lines} />}
    </span>
  )
}

function OutflowCell({ entry }: { entry: Entry }) {
  if (entry.outflow <= 0) return <span>—</span>

  const lines: string[] = []
  if (entry.details) {
    lines.push(...buildTooltipLines(entry.details.expenses, (e) => e.description || "Despesa"))
    lines.push(...buildTooltipLines(entry.details.repasse, (r) => `Repasse: ${r.professionalName}`))
  }

  return (
    <span className="relative group cursor-default">
      {formatCurrency(entry.outflow)}
      {lines.length > 0 && <Tooltip lines={lines} />}
    </span>
  )
}

function Tooltip({ lines }: { lines: string[] }) {
  const maxVisible = 8
  const hasMore = lines.length > maxVisible
  const visible = hasMore ? lines.slice(0, maxVisible) : lines

  return (
    <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 pointer-events-none">
      <span className="block bg-popover text-popover-foreground border border-border rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap max-w-xs">
        {visible.map((line, i) => (
          <span key={i} className="block truncate">{line}</span>
        ))}
        {hasMore && (
          <span className="block text-muted-foreground mt-1">
            + {lines.length - maxVisible} mais...
          </span>
        )}
      </span>
    </span>
  )
}

export function CashFlowTable({ entries, granularity, todayDivider }: CashFlowTableProps) {
  if (entries.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Sem dados para o período</div>
  }

  // Filter out days with no activity for daily view
  const filtered = granularity === "daily"
    ? entries.filter((e) => e.inflow > 0 || e.outflow > 0)
    : entries

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Período</th>
            <th className="text-right px-4 py-2 font-medium text-green-700">Entradas</th>
            <th className="text-right px-4 py-2 font-medium text-red-700">Saídas</th>
            <th className="text-right px-4 py-2 font-medium">Líquido</th>
            <th className="text-right px-4 py-2 font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filtered.map((entry, i) => {
            const isProjected = todayDivider ? entry.date > todayDivider : false
            const showDivider = todayDivider && i > 0 && filtered[i - 1].date <= todayDivider && entry.date > todayDivider
            return (<React.Fragment key={entry.date}>
            {showDivider && (
              <tr key={`divider-${entry.date}`} className="bg-indigo-50">
                <td colSpan={5} className="px-4 py-1 text-xs text-center text-indigo-600 font-medium">
                  Hoje — abaixo: projetado
                </td>
              </tr>
            )}
            <tr key={entry.date} className={`hover:bg-muted/30 ${isProjected ? "bg-muted/10 text-muted-foreground" : ""}`}>
              <td className="px-4 py-2">{formatDate(entry.date, granularity)}</td>
              <td className="px-4 py-2 text-right text-green-700">
                <InflowCell entry={entry} />
              </td>
              <td className="px-4 py-2 text-right text-red-700">
                <OutflowCell entry={entry} />
              </td>
              <td className={`px-4 py-2 text-right font-medium ${entry.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatCurrency(entry.net)}
              </td>
              <td className={`px-4 py-2 text-right font-medium ${entry.runningBalance >= 0 ? "" : "text-red-700"}`}>
                {formatCurrency(entry.runningBalance)}
              </td>
            </tr>
          </React.Fragment>)})}
        </tbody>
      </table>
    </div>
  )
}
