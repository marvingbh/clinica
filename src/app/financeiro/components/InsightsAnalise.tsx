"use client"

import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { InsightsData, MetricCard } from "./dashboard-shared"

const AGING_LABELS: Record<string, string> = {
  credits0to30: "0–30 dias",
  credits31to60: "31–60 dias",
  credits61to90: "61–90 dias",
  creditsOver90: "90+ dias",
}

const AGING_COLORS: Record<string, string> = {
  credits0to30: "bg-green-500",
  credits31to60: "bg-yellow-500",
  credits61to90: "bg-orange-500",
  creditsOver90: "bg-red-500",
}

interface Props {
  data: InsightsData
}

export function InsightsAnalise({ data }: Props) {
  const { concentracao: conc, creditosAging: aging } = data
  const top3Pct = (conc.top3Concentration * 100).toFixed(1)
  const totalPendingCredits = Object.values(aging).reduce((s, b) => s + b.count, 0)

  return (
    <div className="space-y-6">
      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          label="Concentração Top 3 Pacientes"
          value={`${top3Pct}%`}
          sub="da receita nos 3 maiores pagantes"
          detail={
            Number(top3Pct) > 50
              ? <span className="text-xs text-orange-600">Alta concentração — risco de dependência</span>
              : <span className="text-xs text-green-600">Receita bem distribuída</span>
          }
        />
        <MetricCard
          label="Créditos Pendentes"
          value={String(totalPendingCredits)}
          sub="sessões pagas ainda não consumidas"
        />
      </div>

      {/* Top patients table */}
      {conc.topPatients.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Maiores Pagantes</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium">Paciente</th>
                  <th className="text-right py-3 px-4 font-medium">Valor</th>
                  <th className="text-right py-3 px-4 font-medium">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {conc.topPatients.map(p => {
                  const pct = (p.percentOfTotal * 100).toFixed(1)
                  return (
                    <tr key={p.patientId} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">{p.patientName}</td>
                      <td className="text-right py-3 px-4">{formatCurrencyBRL(p.amount)}</td>
                      <td className="text-right py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Number(pct)}%` }} />
                          </div>
                          <span className="text-xs font-medium w-12 text-right">{pct}%</span>
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

      {/* Credits aging */}
      {totalPendingCredits > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Aging de Créditos</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(AGING_LABELS).map(([key, label]) => {
              const bucket = aging[key] || { count: 0, totalDays: 0 }
              return (
                <div key={key} className="p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full ${AGING_COLORS[key]}`} />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                  <div className="text-2xl font-bold">{bucket.count}</div>
                  <div className="text-xs text-muted-foreground">
                    {bucket.count > 0 ? `média ${bucket.totalDays} dias` : "nenhum"}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Aging bar visualization */}
          {totalPendingCredits > 0 && (
            <div className="mt-3 h-4 rounded-full overflow-hidden flex">
              {Object.entries(AGING_LABELS).map(([key]) => {
                const bucket = aging[key] || { count: 0, totalDays: 0 }
                const pct = totalPendingCredits > 0 ? (bucket.count / totalPendingCredits) * 100 : 0
                if (pct === 0) return null
                return (
                  <div
                    key={key}
                    className={`${AGING_COLORS[key]} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                    title={`${AGING_LABELS[key]}: ${bucket.count} créditos`}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
