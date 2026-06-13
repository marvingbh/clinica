"use client"

import { KPI, KPIGrid } from "@/shared/components/ui/kpi"
import { useReport } from "./useReport"
import { ComparisonTable } from "./ComparisonTable"
import { TrendChart } from "./TrendChart"
import { ExportCsvButton } from "./ExportCsvButton"
import { MetricEmptyState } from "./MetricEmptyState"
import { Loading, ErrorState } from "./tab-states"
import { fmtPct, fmtNumber } from "./format"
import type { OverviewResponse } from "./types"

const EMPTY =
  "Sem atendimentos neste período. A taxa de ocupação compara as horas agendadas com a disponibilidade cadastrada de cada profissional."

export function OverviewTab({ query }: { query: string }) {
  const url = `/api/relatorios/overview?${query}`
  const { data, loading, error } = useReport<OverviewResponse>(url)

  if (loading) return <Loading />
  if (error || !data) return <ErrorState />

  const hasData = data.professionals.length > 0 || data.totals.sessions > 0
  if (!hasData) return <MetricEmptyState message={EMPTY} />

  return (
    <div className="space-y-6">
      <KPIGrid>
        <KPI label="Taxa de ocupação" value={fmtPct(data.totals.occupancy)} />
        <KPI label="Sessões realizadas" value={fmtNumber(data.totals.sessions)} />
        <KPI label="Taxa de cancelamento" value={fmtPct(data.totals.cancellationRate)} />
        <KPI label="Reagendamento em 7 dias" value={fmtPct(data.totals.rebooking7)} />
        <KPI label="Pacientes novos no período" value={fmtNumber(data.totals.newPatients)} />
      </KPIGrid>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Desempenho por profissional</h3>
          <ExportCsvButton apiUrl={url} />
        </div>
        <ComparisonTable rows={data.professionals} />
      </div>

      <div className="border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">Tendência</h3>
        <TrendChart data={data.trend} />
      </div>
    </div>
  )
}
