"use client"

import { KPI, KPIGrid } from "@/shared/components/ui/kpi"
import { useReport } from "./useReport"
import { ExportCsvButton } from "./ExportCsvButton"
import { MetricEmptyState } from "./MetricEmptyState"
import { HeatmapGrid } from "./HeatmapGrid"
import { Loading, ErrorState } from "./tab-states"
import { fmtPct, fmtNumber } from "./format"
import type { CancellationsResponse } from "./types"

const EMPTY =
  "Nenhum cancelamento neste período. Quando houver, você verá aqui os dias e horários em que eles mais acontecem."

export function CancelamentosTab({ query }: { query: string }) {
  const url = `/api/relatorios/cancelamentos?${query}`
  const { data, loading, error } = useReport<CancellationsResponse>(url)

  if (loading) return <Loading />
  if (error || !data) return <ErrorState />
  if (data.totals.cancelled === 0) return <MetricEmptyState message={EMPTY} />

  const t = data.totals.byStatus

  return (
    <div className="space-y-6">
      <KPIGrid>
        <KPI label="Cancelado (acordado)" value={fmtNumber(t.CANCELADO_ACORDADO)} />
        <KPI label="Falta" value={fmtNumber(t.CANCELADO_FALTA)} />
        <KPI label="Cancelado pelo profissional" value={fmtNumber(t.CANCELADO_PROFISSIONAL)} />
        <KPI label="Taxa total de cancelamento" value={fmtPct(data.totals.rate)} />
      </KPIGrid>

      <div className="border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cancelamentos por dia e horário</h3>
        <HeatmapGrid cells={data.heatmap} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Por profissional</h3>
          <ExportCsvButton apiUrl={url} />
        </div>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Profissional</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium text-right">Cancelados</th>
                <th className="px-3 py-2 font-medium text-right">% Cancel.</th>
                <th className="px-3 py-2 font-medium text-right">Ac./Falta/Prof.</th>
              </tr>
            </thead>
            <tbody>
              {data.byProfessional.map((p) => (
                <tr key={p.professionalProfileId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">{p.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(p.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(p.cancelled)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(p.rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {p.byStatus.CANCELADO_ACORDADO}/{p.byStatus.CANCELADO_FALTA}/{p.byStatus.CANCELADO_PROFISSIONAL}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
