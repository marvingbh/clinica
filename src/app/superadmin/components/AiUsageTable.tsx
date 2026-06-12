"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"

interface AiUsageRow {
  clinicId: string
  clinicName: string
  generations: number
  tokensIn: number
  tokensOut: number
  positive: number
  negative: number
}

/** Per-clinic AI consumption for the current UTC month (superadmin dashboard). */
export function AiUsageTable() {
  const [rows, setRows] = useState<AiUsageRow[] | null>(null)
  const [error, setError] = useState(false)

  useMountEffect(() => {
    const controller = new AbortController()
    fetch("/api/superadmin/ai-usage", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then((data) => setRows(data.rows))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(true)
      })
    return () => controller.abort()
  })

  if (error) return null

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground mb-4">Consumo de IA (mês)</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Clínica</th>
                <th className="px-4 py-3 text-right font-medium">Gerações (mês)</th>
                <th className="px-4 py-3 text-right font-medium">Tokens entrada</th>
                <th className="px-4 py-3 text-right font-medium">Tokens saída</th>
                <th className="px-4 py-3 text-right font-medium">👍 / 👎</th>
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhum uso de IA neste mês.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.clinicId} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">{r.clinicName}</td>
                    <td className="px-4 py-3 text-right text-foreground">{r.generations}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {r.tokensIn.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {r.tokensOut.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {r.positive} / {r.negative}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
