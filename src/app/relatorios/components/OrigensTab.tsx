"use client"

import { useReport } from "./useReport"
import { ExportCsvButton } from "./ExportCsvButton"
import { MetricEmptyState } from "./MetricEmptyState"
import { Loading, ErrorState } from "./tab-states"
import { fmtPct, fmtNumber } from "./format"
import type { OriginsResponse } from "./types"

const EMPTY =
  'Cadastre a origem dos novos pacientes ("Como conheceu a clínica?") para descobrir qual canal traz mais pacientes.'

export function OrigensTab({ query }: { query: string }) {
  const url = `/api/relatorios/origens?${query}`
  const { data, loading, error } = useReport<OriginsResponse>(url)

  if (loading) return <Loading />
  if (error || !data) return <ErrorState />
  if (data.total === 0) return <MetricEmptyState message={EMPTY} />

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Pacientes novos por origem</h3>
          <ExportCsvButton apiUrl={url} />
        </div>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Origem</th>
                <th className="px-3 py-2 font-medium text-right">Pacientes novos</th>
                <th className="px-3 py-2 font-medium text-right">Converteram</th>
                <th className="px-3 py-2 font-medium text-right">% Conversão</th>
              </tr>
            </thead>
            <tbody>
              {data.bySource.map((s) => (
                <tr key={s.source} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">{s.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(s.count)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(s.converted)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(s.conversionPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
