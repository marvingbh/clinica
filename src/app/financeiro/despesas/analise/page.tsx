"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useFinanceiroContext } from "../../context/FinanceiroContext"
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"

interface Expense {
  id: string
  description: string
  supplierName: string | null
  amount: string
  dueDate: string
  status: string
  category: { id: string; name: string; color: string } | null
}

const COLORS = [
  "#8B5CF6", "#F59E0B", "#3B82F6", "#6366F1", "#10B981",
  "#EC4899", "#14B8A6", "#F97316", "#A855F7", "#06B6D4",
  "#84CC16", "#EF4444", "#D946EF", "#0D9488", "#059669", "#6B7280",
]

export default function AnalisePage() {
  const { year, month } = useFinanceiroContext()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loaded, setLoaded] = useState(false)

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ year: year.toString() })
    if (month) params.set("month", month.toString())

    const res = await fetch(`/api/financeiro/despesas?${params}`)
    if (res.ok) setExpenses(await res.json())
    setLoaded(true)
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  // Group by category
  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number; count: number }>()
    for (const e of expenses) {
      if (e.status === "CANCELLED") continue
      const key = e.category?.id ?? "sem-categoria"
      const existing = map.get(key)
      const amt = Number(e.amount)
      if (existing) {
        existing.total += amt
        existing.count++
      } else {
        map.set(key, {
          name: e.category?.name ?? "Sem categoria",
          color: e.category?.color ?? "#6B7280",
          total: amt,
          count: 1,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [expenses])

  // Group by supplier
  const bySupplier = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>()
    for (const e of expenses) {
      if (e.status === "CANCELLED") continue
      const key = e.supplierName ?? "Sem fornecedor"
      const existing = map.get(key)
      const amt = Number(e.amount)
      if (existing) {
        existing.total += amt
        existing.count++
      } else {
        map.set(key, { name: key, total: amt, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10)
  }, [expenses])

  const totalExpenses = byCategory.reduce((sum, c) => sum + c.total, 0)

  const periodLabel = month
    ? `${String(month).padStart(2, "0")}/${year}`
    : `${year}`

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg mb-2">Sem despesas para {periodLabel}</p>
        <p className="text-sm">Cadastre despesas para ver a análise por categoria</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Análise de Despesas — {periodLabel}</h2>
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-semibold text-foreground">{formatCurrency(totalExpenses)}</span>
        </p>
      </div>

      {/* Pie chart + Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Despesas por Categoria</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={byCategory}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                labelLine={false}
              >
                {byCategory.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.color || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Detalhamento</h3>
          <div className="space-y-2">
            {byCategory.map((cat) => {
              const pct = totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0
              return (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm flex-1 truncate">{cat.name}</span>
                  <span className="text-xs text-muted-foreground">{cat.count}x</span>
                  <span className="text-sm font-medium w-28 text-right">{formatCurrency(cat.total)}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top suppliers bar chart */}
      {bySupplier.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Top Fornecedores</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, bySupplier.length * 40)}>
            <BarChart data={bySupplier} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="total" fill="#6366F1" radius={[0, 4, 4, 0]} name="Total" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
