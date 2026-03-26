"use client"

import React from "react"

interface Entry {
  date: string
  inflow: number
  outflow: number
  net: number
  runningBalance: number
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
                {entry.inflow > 0 ? formatCurrency(entry.inflow) : "—"}
              </td>
              <td className="px-4 py-2 text-right text-red-700">
                {entry.outflow > 0 ? formatCurrency(entry.outflow) : "—"}
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
